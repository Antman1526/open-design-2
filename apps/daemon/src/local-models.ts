import { access, readdir, stat } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import {
  computeLocalModelOverallSuccess,
  inferLocalModelRoles,
  LocalModelRecordSchema,
  LocalModelDiagnosticsResponseSchema,
  LocalModelRouteResponseSchema,
  LocalModelScorecardSchema,
  LocalModelTestResponseSchema,
  type LocalModelRecord,
  type LocalModelDiagnosticsResponse,
  type LocalModelRouteResponse,
  type LocalModelScorecard,
  type LocalModelServerMode,
  type LocalModelTask,
  type LocalModelTestRequest,
  type LocalModelTestResponse,
} from '@open-design/contracts';
import type Database from 'better-sqlite3';

export const DEFAULT_LOCAL_MODEL_ROOT = '/Users/Antman/Desktop/AI_Models';

export interface LocalModelAttemptInput {
  latencyMs: number;
  completed: boolean;
  designPassed: boolean;
  userMarkedSuccess: boolean;
  timedOut: boolean;
  crashed: boolean;
}

type SqliteDb = Database.Database;

interface LocalModelRow {
  id: string;
  name: string;
  fileName: string;
  path: string;
  sizeBytes: number;
  mtimeMs: number;
  digest: string;
  rolesJson: string;
  enabled: number;
  discoveredAt: number;
  updatedAt: number;
}

interface LocalModelScorecardRow {
  modelId: string;
  task: LocalModelTask;
  attempts: number;
  completionSuccess: number;
  designSuccess: number;
  userSuccess: number;
  performanceScore: number;
  overallSuccess: number;
  medianLatencyMs: number | null;
  timeoutRate: number;
  crashRate: number;
  updatedAt: number;
}

interface LocalModelRunRow {
  latencyMs: number;
  completed: number;
  designPassed: number;
  userMarkedSuccess: number;
  timedOut: number;
  crashed: number;
}

type ManagedServer = {
  modelId: string;
  modelPath: string;
  port: number;
  process: ChildProcess;
  startedAt: number;
};

const managedServers = new Map<string, ManagedServer>();
const DEFAULT_TEST_PROMPT = 'Reply with one short sentence confirming this local model is ready.';
const DEFAULT_TEST_TIMEOUT_MS = 45_000;
const LOCAL_OPENAI_BASE_URLS = [
  'http://127.0.0.1:8080/v1',
  'http://127.0.0.1:8000/v1',
];
const OLLAMA_OPENAI_BASE_URL = 'http://127.0.0.1:11434/v1';
const LLAMA_SERVER_PORT_RETRIES = 5;
let cleanupHooksRegistered = false;

export function localModelIdForPath(modelPath: string): string {
  const resolvedPath = path.resolve(modelPath);
  const base = sanitizeIdPart(path.basename(resolvedPath));
  const digest = sha256Hex(resolvedPath).slice(0, 12);
  return `lm_${base}_${digest}`;
}

export async function scanLocalModels(
  root = DEFAULT_LOCAL_MODEL_ROOT,
  opts: { now?: number } = {},
): Promise<LocalModelRecord[]> {
  const now = opts.now ?? Date.now();
  const resolvedRoot = path.resolve(root);
  const scanRoot =
    path.basename(resolvedRoot).toLowerCase() === 'gguf'
      ? resolvedRoot
      : path.join(resolvedRoot, 'GGUF');

  let entries: Dirent[];
  try {
    entries = await readdir(scanRoot, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) return [];
    throw error;
  }

  const models: LocalModelRecord[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.gguf')) {
      continue;
    }

    const modelPath = path.join(scanRoot, entry.name);
    const modelStat = await stat(modelPath);
    if (!modelStat.isFile()) continue;

    const name = entry.name.replace(/\.gguf$/i, '');
    models.push(
      LocalModelRecordSchema.parse({
        id: localModelIdForPath(modelPath),
        name,
        fileName: entry.name,
        path: modelPath,
        sizeBytes: modelStat.size,
        mtimeMs: modelStat.mtimeMs,
        digest: sha256Hex(path.resolve(modelPath)),
        roles: inferLocalModelRoles(entry.name),
        enabled: true,
        discoveredAt: now,
        updatedAt: now,
      }),
    );
  }

  return models.sort((a, b) => a.fileName.localeCompare(b.fileName));
}

export async function diagnoseLocalModelSetup(input: {
  root?: string | undefined;
  llamaServerBin?: string | undefined;
  now?: number;
} = {}): Promise<LocalModelDiagnosticsResponse> {
  const root = path.resolve(input.root?.trim() || DEFAULT_LOCAL_MODEL_ROOT);
  const gguf = path.basename(root).toLowerCase() === 'gguf' ? root : path.join(root, 'GGUF');
  const [rootCheck, ggufCheck] = await Promise.all([
    checkReadablePath(root, 'model root'),
    checkReadablePath(gguf, 'GGUF folder'),
  ]);
  let modelCount = 0;
  if (ggufCheck.readable) {
    try {
      const entries = await readdir(gguf, { withFileTypes: true });
      modelCount = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.gguf')).length;
    } catch {
      modelCount = 0;
    }
  }

  return LocalModelDiagnosticsResponseSchema.parse({
    root: rootCheck,
    gguf: ggufCheck,
    llamaServer: checkLlamaServerBinary(input.llamaServerBin),
    modelCount,
    checkedAt: input.now ?? Date.now(),
  });
}

export function computeRollingScorecard(
  modelId: string,
  task: LocalModelTask,
  attempts: LocalModelAttemptInput[],
  now = Date.now(),
): LocalModelScorecard {
  const total = attempts.length;
  const completionSuccess = rate(attempts.filter((attempt) => attempt.completed).length, total);
  const designSuccess = rate(attempts.filter((attempt) => attempt.designPassed).length, total);
  const userSuccess = rate(attempts.filter((attempt) => attempt.userMarkedSuccess).length, total);
  const timeoutRate = rate(attempts.filter((attempt) => attempt.timedOut).length, total);
  const crashRate = rate(attempts.filter((attempt) => attempt.crashed).length, total);
  const completedLatencies = attempts
    .filter((attempt) => attempt.completed)
    .map((attempt) => attempt.latencyMs)
    .sort((a, b) => a - b);
  const medianLatencyMs = medianLatency(completedLatencies);
  const performanceScore =
    medianLatencyMs === null ? 0 : roundRate(clamp01(1 - medianLatencyMs / 120_000));
  const overallSuccess = computeLocalModelOverallSuccess({
    completionSuccess,
    designSuccess,
    userSuccess,
    performanceScore,
  });

  return LocalModelScorecardSchema.parse({
    modelId,
    task,
    attempts: total,
    completionSuccess,
    designSuccess,
    userSuccess,
    performanceScore,
    overallSuccess,
    medianLatencyMs,
    timeoutRate,
    crashRate,
    updatedAt: now,
  });
}

export function migrateLocalModels(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_models (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      file_name     TEXT NOT NULL,
      path          TEXT NOT NULL UNIQUE,
      size_bytes    INTEGER NOT NULL,
      mtime_ms      REAL NOT NULL,
      digest        TEXT NOT NULL,
      roles_json    TEXT NOT NULL,
      enabled       INTEGER NOT NULL DEFAULT 1,
      discovered_at INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_local_models_file_name
      ON local_models(file_name);

    CREATE TABLE IF NOT EXISTS local_model_runs (
      id                  TEXT PRIMARY KEY,
      model_id            TEXT NOT NULL,
      task                TEXT NOT NULL,
      latency_ms          INTEGER NOT NULL,
      completed           INTEGER NOT NULL,
      design_passed       INTEGER NOT NULL,
      user_marked_success INTEGER NOT NULL,
      timed_out           INTEGER NOT NULL,
      crashed             INTEGER NOT NULL,
      server_mode         TEXT,
      sample              TEXT,
      error               TEXT,
      created_at          INTEGER NOT NULL,
      FOREIGN KEY (model_id) REFERENCES local_models(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_local_model_runs_model_task
      ON local_model_runs(model_id, task, created_at DESC);

    CREATE TABLE IF NOT EXISTS local_model_scorecards (
      model_id           TEXT NOT NULL,
      task               TEXT NOT NULL,
      attempts           INTEGER NOT NULL,
      completion_success REAL NOT NULL,
      design_success     REAL NOT NULL,
      user_success       REAL NOT NULL,
      performance_score  REAL NOT NULL,
      overall_success    REAL NOT NULL,
      median_latency_ms  INTEGER,
      timeout_rate       REAL NOT NULL,
      crash_rate         REAL NOT NULL,
      updated_at         INTEGER NOT NULL,
      PRIMARY KEY (model_id, task),
      FOREIGN KEY (model_id) REFERENCES local_models(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_local_model_scorecards_rank
      ON local_model_scorecards(overall_success DESC, model_id ASC);
  `);

  const runCols = db.prepare(`PRAGMA table_info(local_model_runs)`).all() as Array<{ name: string }>;
  if (!runCols.some((col) => col.name === 'server_mode')) {
    db.exec(`ALTER TABLE local_model_runs ADD COLUMN server_mode TEXT`);
  }
  if (!runCols.some((col) => col.name === 'sample')) {
    db.exec(`ALTER TABLE local_model_runs ADD COLUMN sample TEXT`);
  }
  if (!runCols.some((col) => col.name === 'error')) {
    db.exec(`ALTER TABLE local_model_runs ADD COLUMN error TEXT`);
  }
}

export function upsertLocalModels(db: SqliteDb, models: LocalModelRecord[]): void {
  const insert = db.prepare(`
    INSERT INTO local_models
      (id, name, file_name, path, size_bytes, mtime_ms, digest, roles_json,
       enabled, discovered_at, updated_at)
    VALUES
      (@id, @name, @fileName, @path, @sizeBytes, @mtimeMs, @digest, @rolesJson,
       @enabled, @discoveredAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      file_name = excluded.file_name,
      path = excluded.path,
      size_bytes = excluded.size_bytes,
      mtime_ms = excluded.mtime_ms,
      digest = excluded.digest,
      roles_json = excluded.roles_json,
      updated_at = excluded.updated_at
  `);
  const tx = db.transaction((records: LocalModelRecord[]) => {
    for (const model of records) {
      insert.run({
        ...model,
        rolesJson: JSON.stringify(model.roles),
        enabled: model.enabled ? 1 : 0,
      });
    }
  });
  tx(models);
}

export async function scanAndPersistLocalModels(
  db: SqliteDb,
  root = DEFAULT_LOCAL_MODEL_ROOT,
  opts: { now?: number } = {},
): Promise<{
  root: string;
  models: LocalModelRecord[];
  scannedAt: number;
}> {
  const scannedAt = opts.now ?? Date.now();
  const scannedModels = await scanLocalModels(root, { now: scannedAt });
  upsertLocalModels(db, scannedModels);
  return {
    root,
    models: listLocalModels(db),
    scannedAt,
  };
}

export function listLocalModels(db: SqliteDb): LocalModelRecord[] {
  const rows = db
    .prepare(
      `SELECT
         id,
         name,
         file_name AS fileName,
         path,
         size_bytes AS sizeBytes,
         mtime_ms AS mtimeMs,
         digest,
         roles_json AS rolesJson,
         enabled,
         discovered_at AS discoveredAt,
         updated_at AS updatedAt
       FROM local_models
       ORDER BY file_name ASC`,
    )
    .all() as LocalModelRow[];
  return rows.map(mapLocalModelRow);
}

export function setLocalModelEnabled(
  db: SqliteDb,
  id: string,
  enabled: boolean,
): LocalModelRecord | null {
  db.prepare(
    `UPDATE local_models
        SET enabled = ?,
            updated_at = ?
      WHERE id = ?`,
  ).run(enabled ? 1 : 0, Date.now(), id);

  const row = db
    .prepare(
      `SELECT
         id,
         name,
         file_name AS fileName,
         path,
         size_bytes AS sizeBytes,
         mtime_ms AS mtimeMs,
         digest,
         roles_json AS rolesJson,
         enabled,
         discovered_at AS discoveredAt,
         updated_at AS updatedAt
       FROM local_models
       WHERE id = ?`,
    )
    .get(id) as LocalModelRow | undefined;
  return row ? mapLocalModelRow(row) : null;
}

export function getLocalModel(db: SqliteDb, id: string): LocalModelRecord | null {
  const row = db
    .prepare(
      `SELECT
         id,
         name,
         file_name AS fileName,
         path,
         size_bytes AS sizeBytes,
         mtime_ms AS mtimeMs,
         digest,
         roles_json AS rolesJson,
         enabled,
         discovered_at AS discoveredAt,
         updated_at AS updatedAt
       FROM local_models
       WHERE id = ?`,
    )
    .get(id) as LocalModelRow | undefined;
  return row ? mapLocalModelRow(row) : null;
}

export function listLocalModelScorecards(db: SqliteDb): LocalModelScorecard[] {
  const rows = db
    .prepare(
      `SELECT
         model_id AS modelId,
         task,
         attempts,
         completion_success AS completionSuccess,
         design_success AS designSuccess,
         user_success AS userSuccess,
         performance_score AS performanceScore,
         overall_success AS overallSuccess,
         median_latency_ms AS medianLatencyMs,
         timeout_rate AS timeoutRate,
         crash_rate AS crashRate,
         updated_at AS updatedAt
       FROM local_model_scorecards
       ORDER BY overall_success DESC, model_id ASC`,
    )
    .all() as LocalModelScorecardRow[];
  return rows.map((row) => LocalModelScorecardSchema.parse(row));
}

export function routeLocalModel(db: SqliteDb, task: LocalModelTask): LocalModelRouteResponse {
  const enabled = listLocalModels(db).filter((model) => model.enabled);
  if (enabled.length === 0) {
    return LocalModelRouteResponseSchema.parse({
      model: null,
      scorecard: null,
      task,
      reason: 'no enabled local models',
    });
  }

  const scorecards = listLocalModelScorecards(db);
  const byModelTask = new Map(scorecards.map((scorecard) => [`${scorecard.modelId}:${scorecard.task}`, scorecard]));
  const ranked = enabled
    .map((model) => {
      const scorecard = byModelTask.get(`${model.id}:${task}`) ?? null;
      const roleScore = model.roles.includes(taskRole(task)) ? 1 : 0;
      const priorScore = model.roles.length > 0 ? 0.35 : 0;
      const observed = scorecard ? scorecard.overallSuccess : priorScore;
      return { model, scorecard, rank: roleScore + observed - (scorecard?.timeoutRate ?? 0) - (scorecard?.crashRate ?? 0) };
    })
    .sort((a, b) => b.rank - a.rank || a.model.name.localeCompare(b.model.name));

  const top = ranked[0]!;
  return LocalModelRouteResponseSchema.parse({
    model: top.model,
    scorecard: top.scorecard,
    task,
    reason: top.scorecard ? 'ranked by role and scorecard' : 'ranked by filename-derived role prior',
  });
}

export async function testLocalModel(
  db: SqliteDb,
  id: string,
  request: LocalModelTestRequest = {},
): Promise<LocalModelTestResponse | null> {
  const model = getLocalModel(db, id);
  if (!model) return null;
  const task = request.task ?? taskFromRoles(model.roles);
  const prompt = request.prompt?.trim() || DEFAULT_TEST_PROMPT;
  const timeoutMs = request.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS;
  const startedAt = Date.now();
  let serverMode: LocalModelServerMode = 'unavailable';
  let sample = '';
  let error: string | undefined;
  let timedOut = false;
  let crashed = false;

  for (const candidate of candidateEndpoints(model)) {
    try {
      serverMode = candidate.mode;
      sample = await completeOpenAICompatible({
        baseUrl: candidate.baseUrl,
        model: candidate.model,
        prompt,
        timeoutMs,
      });
      error = undefined;
      break;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      timedOut ||= /abort|timeout/i.test(error);
    }
  }

  if (!sample) {
    try {
      serverMode = 'llama-server';
      const server = await ensureLlamaServer(model, timeoutMs, request.llamaServerBin);
      sample = await completeOpenAICompatible({
        baseUrl: `http://127.0.0.1:${server.port}/v1`,
        model: model.name,
        prompt,
        timeoutMs,
      });
      error = undefined;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      timedOut ||= /abort|timeout/i.test(error);
      crashed ||= /exited|spawn/i.test(error);
    }
  }

  const latencyMs = Math.max(0, Date.now() - startedAt);
  const completed = sample.trim().length > 0;
  const scorecard = recordLocalModelAttempt(db, {
    modelId: model.id,
    task,
    latencyMs,
    completed,
    designPassed: completed,
    userMarkedSuccess: false,
    timedOut,
    crashed,
    serverMode,
    sample,
    ...(error ? { error } : {}),
  });

  return LocalModelTestResponseSchema.parse({
    ok: completed,
    modelId: model.id,
    task,
    serverMode,
    latencyMs,
    sample,
    ...(error ? { error } : {}),
    scorecard,
  });
}

export function recordLocalModelAttempt(
  db: SqliteDb,
  input: LocalModelAttemptInput & {
    modelId: string;
    task: LocalModelTask;
    serverMode?: LocalModelServerMode;
    sample?: string;
    error?: string;
  },
): LocalModelScorecard {
  const now = Date.now();
  db.prepare(
    `INSERT INTO local_model_runs
       (id, model_id, task, latency_ms, completed, design_passed, user_marked_success,
        timed_out, crashed, server_mode, sample, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    input.modelId,
    input.task,
    input.latencyMs,
    input.completed ? 1 : 0,
    input.designPassed ? 1 : 0,
    input.userMarkedSuccess ? 1 : 0,
    input.timedOut ? 1 : 0,
    input.crashed ? 1 : 0,
    input.serverMode ?? null,
    input.sample?.slice(0, 2000) ?? null,
    input.error?.slice(0, 2000) ?? null,
    now,
  );

  const rows = db
    .prepare(
      `SELECT latency_ms AS latencyMs,
              completed,
              design_passed AS designPassed,
              user_marked_success AS userMarkedSuccess,
              timed_out AS timedOut,
              crashed
         FROM local_model_runs
        WHERE model_id = ? AND task = ?
        ORDER BY created_at DESC
        LIMIT 50`,
    )
    .all(input.modelId, input.task) as LocalModelRunRow[];
  const scorecard = computeRollingScorecard(
    input.modelId,
    input.task,
    rows.map((row) => ({
      latencyMs: row.latencyMs,
      completed: row.completed === 1,
      designPassed: row.designPassed === 1,
      userMarkedSuccess: row.userMarkedSuccess === 1,
      timedOut: row.timedOut === 1,
      crashed: row.crashed === 1,
    })),
    now,
  );
  db.prepare(
    `INSERT INTO local_model_scorecards
       (model_id, task, attempts, completion_success, design_success, user_success,
        performance_score, overall_success, median_latency_ms, timeout_rate, crash_rate, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(model_id, task) DO UPDATE SET
       attempts = excluded.attempts,
       completion_success = excluded.completion_success,
       design_success = excluded.design_success,
       user_success = excluded.user_success,
       performance_score = excluded.performance_score,
       overall_success = excluded.overall_success,
       median_latency_ms = excluded.median_latency_ms,
       timeout_rate = excluded.timeout_rate,
       crash_rate = excluded.crash_rate,
       updated_at = excluded.updated_at`,
  ).run(
    scorecard.modelId,
    scorecard.task,
    scorecard.attempts,
    scorecard.completionSuccess,
    scorecard.designSuccess,
    scorecard.userSuccess,
    scorecard.performanceScore,
    scorecard.overallSuccess,
    scorecard.medianLatencyMs,
    scorecard.timeoutRate,
    scorecard.crashRate,
    scorecard.updatedAt,
  );
  return scorecard;
}

function mapLocalModelRow(row: LocalModelRow): LocalModelRecord {
  return LocalModelRecordSchema.parse({
    id: row.id,
    name: row.name,
    fileName: row.fileName,
    path: row.path,
    sizeBytes: row.sizeBytes,
    mtimeMs: row.mtimeMs,
    digest: row.digest,
    roles: JSON.parse(row.rolesJson),
    enabled: row.enabled === 1,
    discoveredAt: row.discoveredAt,
    updatedAt: row.updatedAt,
  });
}

function candidateEndpoints(model: LocalModelRecord): Array<{ mode: LocalModelServerMode; baseUrl: string; model: string }> {
  const names = __localModelCandidateNames(model);
  return [
    ...LOCAL_OPENAI_BASE_URLS.flatMap((baseUrl) => names.map((name) => ({
      mode: 'openai-compatible' as const,
      baseUrl,
      model: name,
    }))),
    ...names.map((name) => ({ mode: 'ollama' as const, baseUrl: OLLAMA_OPENAI_BASE_URL, model: name })),
  ];
}

async function completeOpenAICompatible(input: {
  baseUrl: string;
  model: string;
  prompt: string;
  timeoutMs: number;
}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await fetch(`${input.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        messages: [{ role: 'user', content: input.prompt }],
        max_tokens: 64,
        temperature: 0,
        stream: false,
      }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    const parsed = JSON.parse(text) as { choices?: Array<{ message?: { content?: string }; text?: string }> };
    const sample = parsed.choices?.[0]?.message?.content ?? parsed.choices?.[0]?.text ?? '';
    if (!sample.trim()) throw new Error('empty completion');
    return sample.trim();
  } finally {
    clearTimeout(timer);
  }
}

async function ensureLlamaServer(
  model: LocalModelRecord,
  timeoutMs: number,
  llamaServerBin?: string,
): Promise<ManagedServer> {
  const current = managedServers.get(model.id);
  if (current && current.process.exitCode == null && !current.process.killed) return current;

  registerCleanupHooks();
  let lastError = 'llama-server unavailable';
  for (const port of __localModelServerPorts(model.digest)) {
    if (!(await isPortAvailable(port))) {
      lastError = `port ${port} is already in use`;
      continue;
    }
    const child = spawnLlamaServer(model, port, llamaServerBin);
    const server: ManagedServer = { modelId: model.id, modelPath: model.path, port, process: child, startedAt: Date.now() };
    managedServers.set(model.id, server);
    try {
      await waitForServer(`http://127.0.0.1:${port}/v1`, timeoutMs, child);
      return server;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      stopManagedServer(model.id);
    }
  }
  throw new Error(lastError);
}

function spawnLlamaServer(model: LocalModelRecord, port: number, llamaServerBin?: string): ChildProcess {
  const bin = resolveLlamaServerCommand(llamaServerBin);
  const child = spawn(bin, [
    '--model',
    model.path,
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--ctx-size',
    process.env.OD_LOCAL_MODEL_CTX_SIZE || '4096',
    '--n-gpu-layers',
    process.env.OD_LOCAL_MODEL_GPU_LAYERS || '999',
  ], {
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
  return child;
}

async function waitForServer(baseUrl: string, timeoutMs: number, child?: ChildProcess): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'server did not start';
  let processError: string | null = null;
  const onError = (err: Error) => {
    processError = err.message;
  };
  const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
    processError = `llama-server exited${code == null ? '' : ` with code ${code}`}${signal ? ` (${signal})` : ''}`;
  };
  child?.once('error', onError);
  child?.once('exit', onExit);
  while (Date.now() < deadline) {
    if (processError) {
      child?.off('error', onError);
      child?.off('exit', onExit);
      throw new Error(processError);
    }
    try {
      const response = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        child?.off('error', onError);
        child?.off('exit', onExit);
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  child?.off('error', onError);
  child?.off('exit', onExit);
  throw new Error(`llama-server unavailable: ${lastError}`);
}

function stopManagedServer(modelId: string): void {
  const server = managedServers.get(modelId);
  if (!server) return;
  managedServers.delete(modelId);
  if (server.process.exitCode == null && !server.process.killed) {
    try {
      if (server.process.pid) {
        process.kill(-server.process.pid, 'SIGTERM');
      } else {
        server.process.kill('SIGTERM');
      }
    } catch {
      try {
        server.process.kill('SIGTERM');
      } catch {
        // The process may already be gone.
      }
    }
  }
}

export function stopManagedLocalModelServers(): void {
  for (const modelId of Array.from(managedServers.keys())) {
    stopManagedServer(modelId);
  }
}

function registerCleanupHooks(): void {
  if (cleanupHooksRegistered) return;
  cleanupHooksRegistered = true;
  process.once('exit', stopManagedLocalModelServers);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      stopManagedLocalModelServers();
      process.kill(process.pid, signal);
    });
  }
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

export function __localModelServerPorts(digest: string): number[] {
  const base = 18_000 + (Number.parseInt(digest.slice(0, 4), 16) % 1000);
  return Array.from({ length: LLAMA_SERVER_PORT_RETRIES }, (_unused, index) => base + index);
}

export function __localModelCandidateNames(model: Pick<LocalModelRecord, 'name' | 'fileName'>): string[] {
  const base = model.fileName.replace(/\.gguf$/i, '');
  const candidates = [model.name, base, ollamaNameFromGgufName(base)].filter((name): name is string => Boolean(name));
  return Array.from(new Set(candidates));
}

function ollamaNameFromGgufName(name: string): string | null {
  const lower = name.toLowerCase();
  const llama = lower.match(/llama[-_ ]?(\d+(?:\.\d+)?)[-_ ]?(\d+)b/);
  if (llama) return `llama${llama[1]}:${llama[2]}b`;
  const qwen = lower.match(/qwen(?:[-_ ]?(\d+(?:\.\d+)?))?.*?[-_ ](\d+(?:\.\d+)?)b/);
  if (qwen) return `qwen${qwen[1] ?? ''}:${qwen[2]}b`;
  const mistral = lower.match(/mistral[-_ ].*?(\d+)b/);
  if (mistral) return `mistral:${mistral[1]}b`;
  return null;
}

async function checkReadablePath(checkPath: string, label: string): Promise<{
  path: string;
  exists: boolean;
  readable: boolean;
  message: string;
}> {
  try {
    await access(checkPath, fsConstants.F_OK);
  } catch {
    return {
      path: checkPath,
      exists: false,
      readable: false,
      message: `${label} does not exist`,
    };
  }
  try {
    await access(checkPath, fsConstants.R_OK);
    return {
      path: checkPath,
      exists: true,
      readable: true,
      message: `${label} is readable`,
    };
  } catch {
    return {
      path: checkPath,
      exists: true,
      readable: false,
      message: `${label} is not readable`,
    };
  }
}

function checkLlamaServerBinary(llamaServerBin?: string): {
  command: string;
  available: boolean;
  resolvedPath?: string;
  message: string;
} {
  const command = resolveLlamaServerCommand(llamaServerBin);
  if (path.isAbsolute(command) || command.includes('/')) {
    const result = spawnSync(command, ['--help'], { encoding: 'utf8', timeout: 3000 });
    return {
      command,
      available: result.status === 0 || result.status === 1,
      resolvedPath: command,
      message: result.error ? result.error.message : `checked ${command}`,
    };
  }
  const which = spawnSync('which', [command], { encoding: 'utf8', timeout: 3000 });
  const resolvedPath = which.status === 0 ? which.stdout.trim().split('\n')[0] : undefined;
  return {
    command,
    available: Boolean(resolvedPath),
    ...(resolvedPath ? { resolvedPath } : {}),
    message: resolvedPath ? `${command} found at ${resolvedPath}` : `${command} was not found on PATH`,
  };
}

function resolveLlamaServerCommand(llamaServerBin?: string): string {
  return llamaServerBin?.trim() || process.env.LLAMA_SERVER_BIN || 'llama-server';
}

function taskFromRoles(roles: LocalModelRecord['roles']): LocalModelTask {
  if (roles.includes('embedding')) return 'embedding';
  if (roles.includes('summary')) return 'summary';
  if (roles.includes('code')) return 'code';
  if (roles.includes('repair')) return 'repair';
  return 'design';
}

function taskRole(task: LocalModelTask): LocalModelRecord['roles'][number] {
  if (task === 'critique') return 'repair';
  if (task === 'fallback') return 'fallback';
  return task;
}

function medianLatency(latencies: number[]): number | null {
  if (latencies.length === 0) return null;
  const midpoint = Math.floor(latencies.length / 2);
  if (latencies.length % 2 === 1) return latencies[midpoint] ?? null;
  const lower = latencies[midpoint - 1];
  const upper = latencies[midpoint];
  if (lower === undefined || upper === undefined) return null;
  return Math.round((lower + upper) / 2);
}

function rate(count: number, total: number): number {
  if (total === 0) return 0;
  return roundRate(count / total);
}

function roundRate(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sanitizeIdPart(value: string): string {
  const sanitized = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized.length > 0 ? sanitized : 'model';
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}
