import { readdir, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  computeLocalModelOverallSuccess,
  inferLocalModelRoles,
  LocalModelRecordSchema,
  LocalModelScorecardSchema,
  type LocalModelRecord,
  type LocalModelScorecard,
  type LocalModelTask,
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
