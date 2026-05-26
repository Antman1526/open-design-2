# Local Model Pool Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first shippable local-model foundation: scan `/Users/Antman/Desktop/AI_Models/GGUF`, persist discovered GGUF models, expose scorecard math, and make scan/list/scorecard available through HTTP, CLI, and a minimal web data surface.

**Architecture:** Phase 1 is intentionally limited to model discovery and scorecards. It adds pure contracts, pure scanner/scorecard services, SQLite persistence, daemon routes, CLI commands, and web fetch helpers without launching llama.cpp or changing run routing. Later phases can consume these APIs to start local servers, index design sources, and route generation.

**Tech Stack:** TypeScript, Zod, Express 5, better-sqlite3, Vitest, React 18, Next.js 16, existing Open Design `od` CLI.

---

## Scope

This plan implements Phase 1 from `specs/current/local-model-pool-and-design-sources.md`.

Included:

- Model DTO contracts.
- Scorecard DTO contracts and formula.
- GGUF scanner for `/Users/Antman/Desktop/AI_Models/GGUF`.
- SQLite persistence for models, run attempts, and scorecards.
- HTTP endpoints for scan/list/enable/disable/scorecards.
- CLI commands for `od model scan`, `list`, `scorecard`, `enable`, and `disable`.
- Minimal web API helpers and a lightweight `LocalModelsSection` component that can be mounted in Settings.

Excluded from this plan:

- Launching llama.cpp.
- Connecting to a local OpenAI-compatible model server.
- Rewriting chat run routing to use local models.
- Design source indexing and retrieval.
- Image OCR/captioning.

## File Structure

- Create `packages/contracts/src/api/local-models.ts`: shared DTOs and validation helpers.
- Modify `packages/contracts/src/index.ts`: export the local-model contracts.
- Create `packages/contracts/tests/local-models.test.ts`: DTO and score formula tests.
- Create `apps/daemon/src/local-models.ts`: scanner, model id/path normalization, role inference, score math, persistence helpers.
- Modify `apps/daemon/src/db.ts`: call the local model migration.
- Create `apps/daemon/src/local-model-routes.ts`: Express endpoints.
- Modify `apps/daemon/src/server.ts`: register local model routes.
- Create `apps/daemon/tests/local-models.test.ts`: scanner, scorecard, persistence tests.
- Create `apps/daemon/tests/local-model-routes.test.ts`: HTTP route tests.
- Modify `apps/daemon/src/cli.ts`: add `od model ...` subcommands.
- Create `apps/daemon/tests/local-models-cli.test.ts`: CLI parser/behavior tests.
- Create `apps/web/src/state/local-models.ts`: fetch helpers for web.
- Create `apps/web/src/components/LocalModelsSection.tsx`: minimal settings panel.
- Modify `apps/web/src/components/SettingsDialog.tsx`: add a Local Models nav item and mount the panel.
- Create `apps/web/tests/state/local-models.test.ts`: web fetch helper tests.
- Create `apps/web/tests/components/local-models-section.test.tsx`: component smoke tests.

## Task 1: Contracts

**Files:**

- Create: `packages/contracts/src/api/local-models.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/tests/local-models.test.ts`

- [ ] **Step 1: Write failing contract tests**

Create `packages/contracts/tests/local-models.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  computeLocalModelOverallSuccess,
  inferLocalModelRoles,
  LocalModelRecordSchema,
  LocalModelScorecardSchema,
} from '../src/api/local-models';

describe('local model contracts', () => {
  it('accepts a discovered GGUF model record', () => {
    const parsed = LocalModelRecordSchema.parse({
      id: 'lm_qwen3_coder_30b_a3b_instruct_q4_k_m_12345678',
      name: 'Qwen3-Coder-30B-A3B-Instruct-Q4_K_M',
      fileName: 'Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf',
      path: '/Users/Antman/Desktop/AI_Models/GGUF/Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf',
      sizeBytes: 123,
      mtimeMs: 456,
      digest: '1234567890abcdef',
      roles: ['code', 'repair'],
      enabled: true,
      discoveredAt: 1779757200000,
      updatedAt: 1779757200000,
    });

    expect(parsed.roles).toEqual(['code', 'repair']);
  });

  it('computes the weighted overall success score', () => {
    expect(
      computeLocalModelOverallSuccess({
        completionSuccess: 0.8,
        designSuccess: 0.6,
        userSuccess: 0.5,
        performanceScore: 0.9,
      }),
    ).toBeCloseTo(0.68, 5);
  });

  it('infers useful role hints from filenames', () => {
    expect(inferLocalModelRoles('nomic-embed-text-v1.5.f16.gguf')).toEqual(['embedding']);
    expect(inferLocalModelRoles('Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf')).toEqual([
      'code',
      'repair',
    ]);
    expect(inferLocalModelRoles('Llama-3.2-1B-Instruct-Q4_K_M.gguf')).toEqual([
      'summary',
      'fallback',
    ]);
  });

  it('accepts scorecards with task-specific metrics', () => {
    const parsed = LocalModelScorecardSchema.parse({
      modelId: 'lm_test',
      task: 'code',
      attempts: 4,
      completionSuccess: 0.75,
      designSuccess: 0.5,
      userSuccess: 0.25,
      performanceScore: 0.9,
      overallSuccess: 0.6275,
      medianLatencyMs: 1200,
      timeoutRate: 0.25,
      crashRate: 0,
      updatedAt: 1779757200000,
    });

    expect(parsed.task).toBe('code');
  });
});
```

- [ ] **Step 2: Run the failing contract tests**

Run:

```bash
pnpm --filter @open-design/contracts test packages/contracts/tests/local-models.test.ts
```

Expected: FAIL because `../src/api/local-models` does not exist.

- [ ] **Step 3: Add local-model contracts**

Create `packages/contracts/src/api/local-models.ts`:

```ts
import { z } from 'zod';

export const LocalModelRoleSchema = z.enum([
  'embedding',
  'summary',
  'design',
  'code',
  'repair',
  'fallback',
]);

export type LocalModelRole = z.infer<typeof LocalModelRoleSchema>;

export const LocalModelTaskSchema = z.enum([
  'embedding',
  'summary',
  'design',
  'code',
  'repair',
  'critique',
  'fallback',
]);

export type LocalModelTask = z.infer<typeof LocalModelTaskSchema>;

export const LocalModelRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fileName: z.string().min(1),
  path: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  mtimeMs: z.number().nonnegative(),
  digest: z.string().min(8),
  roles: z.array(LocalModelRoleSchema),
  enabled: z.boolean(),
  discoveredAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type LocalModelRecord = z.infer<typeof LocalModelRecordSchema>;

export const LocalModelScoreInputSchema = z.object({
  completionSuccess: z.number().min(0).max(1),
  designSuccess: z.number().min(0).max(1),
  userSuccess: z.number().min(0).max(1),
  performanceScore: z.number().min(0).max(1),
});

export type LocalModelScoreInput = z.infer<typeof LocalModelScoreInputSchema>;

export const LocalModelScorecardSchema = LocalModelScoreInputSchema.extend({
  modelId: z.string().min(1),
  task: LocalModelTaskSchema,
  attempts: z.number().int().nonnegative(),
  overallSuccess: z.number().min(0).max(1),
  medianLatencyMs: z.number().int().nonnegative().nullable(),
  timeoutRate: z.number().min(0).max(1),
  crashRate: z.number().min(0).max(1),
  updatedAt: z.number().int().nonnegative(),
});

export type LocalModelScorecard = z.infer<typeof LocalModelScorecardSchema>;

export interface LocalModelScanRequest {
  root?: string;
}

export interface LocalModelScanResponse {
  root: string;
  models: LocalModelRecord[];
  scannedAt: number;
}

export interface LocalModelListResponse {
  models: LocalModelRecord[];
}

export interface LocalModelScorecardsResponse {
  scorecards: LocalModelScorecard[];
}

export interface LocalModelPatchRequest {
  enabled?: boolean;
}

export interface LocalModelPatchResponse {
  model: LocalModelRecord;
}

export function computeLocalModelOverallSuccess(input: LocalModelScoreInput): number {
  LocalModelScoreInputSchema.parse(input);
  const score =
    0.35 * input.completionSuccess +
    0.35 * input.designSuccess +
    0.2 * input.userSuccess +
    0.1 * input.performanceScore;
  return Math.round(score * 10_000) / 10_000;
}

export function inferLocalModelRoles(fileName: string): LocalModelRole[] {
  const lower = fileName.toLowerCase();
  if (lower.includes('embed')) return ['embedding'];
  if (lower.includes('coder') || lower.includes('code')) return ['code', 'repair'];
  if (lower.includes('deepseek') || lower.includes('r1') || lower.includes('reason')) {
    return ['repair', 'design'];
  }
  if (lower.includes('1b') || lower.includes('1.7b') || lower.includes('mini')) {
    return ['summary', 'fallback'];
  }
  if (lower.includes('mistral') || lower.includes('hermes') || lower.includes('qwen')) {
    return ['design'];
  }
  return ['design'];
}
```

- [ ] **Step 4: Export the contracts**

Modify `packages/contracts/src/index.ts` by adding this line after the existing API exports:

```ts
export * from './api/local-models.js';
```

- [ ] **Step 5: Verify contracts pass**

Run:

```bash
pnpm --filter @open-design/contracts test packages/contracts/tests/local-models.test.ts
pnpm --filter @open-design/contracts typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit contracts**

Run:

```bash
git add packages/contracts/src/api/local-models.ts packages/contracts/src/index.ts packages/contracts/tests/local-models.test.ts
git commit -m "feat(contracts): add local model scorecard contracts"
```

## Task 2: Daemon Scanner and Scorecard Service

**Files:**

- Create: `apps/daemon/src/local-models.ts`
- Test: `apps/daemon/tests/local-models.test.ts`

- [ ] **Step 1: Write failing daemon service tests**

Create `apps/daemon/tests/local-models.test.ts`:

```ts
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  computeRollingScorecard,
  localModelIdForPath,
  scanLocalModels,
} from '../src/local-models.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'od-local-models-'));
  tempDirs.push(dir);
  return dir;
}

describe('local model scanner', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('scans GGUF files and ignores support directories plus non-GGUF files', async () => {
    const root = makeTempDir();
    const ggufDir = path.join(root, 'GGUF');
    await mkdir(ggufDir, { recursive: true });
    await mkdir(path.join(root, 'logs'), { recursive: true });
    await writeFile(path.join(ggufDir, 'Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf'), 'model-bytes');
    await writeFile(path.join(ggufDir, 'notes.txt'), 'not a model');

    const models = await scanLocalModels(root, { now: 1779757200000 });

    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      fileName: 'Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf',
      name: 'Qwen3-Coder-30B-A3B-Instruct-Q4_K_M',
      roles: ['code', 'repair'],
      enabled: true,
      discoveredAt: 1779757200000,
    });
    expect(models[0].path).toBe(path.join(ggufDir, 'Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf'));
    expect(models[0].sizeBytes).toBe((await stat(models[0].path)).size);
  });

  it('uses stable ids derived from canonical model paths', () => {
    const id1 = localModelIdForPath('/Users/Antman/Desktop/AI_Models/GGUF/model.gguf');
    const id2 = localModelIdForPath('/Users/Antman/Desktop/AI_Models/GGUF/model.gguf');

    expect(id1).toBe(id2);
    expect(id1).toMatch(/^lm_model_gguf_[a-f0-9]{12}$/);
  });

  it('computes rolling scorecard aggregates', () => {
    const card = computeRollingScorecard('lm_test', 'design', [
      { latencyMs: 1000, completed: true, designPassed: true, userMarkedSuccess: true, timedOut: false, crashed: false },
      { latencyMs: 3000, completed: false, designPassed: false, userMarkedSuccess: false, timedOut: true, crashed: false },
    ], 1779757200000);

    expect(card).toMatchObject({
      modelId: 'lm_test',
      task: 'design',
      attempts: 2,
      completionSuccess: 0.5,
      designSuccess: 0.5,
      userSuccess: 0.5,
      medianLatencyMs: 2000,
      timeoutRate: 0.5,
      crashRate: 0,
      updatedAt: 1779757200000,
    });
    expect(card.overallSuccess).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the failing daemon service tests**

Run:

```bash
pnpm --filter @open-design/daemon test apps/daemon/tests/local-models.test.ts
```

Expected: FAIL because `../src/local-models.js` does not exist.

- [ ] **Step 3: Add scanner and scorecard service**

Create `apps/daemon/src/local-models.ts`:

```ts
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Database as SqliteDb } from 'better-sqlite3';
import {
  computeLocalModelOverallSuccess,
  inferLocalModelRoles,
  type LocalModelRecord,
  type LocalModelScorecard,
  type LocalModelTask,
} from '@open-design/contracts';

export const DEFAULT_LOCAL_MODEL_ROOT = '/Users/Antman/Desktop/AI_Models';

export interface LocalModelAttemptInput {
  latencyMs: number;
  completed: boolean;
  designPassed: boolean;
  userMarkedSuccess: boolean;
  timedOut: boolean;
  crashed: boolean;
}

export function localModelIdForPath(modelPath: string): string {
  const normalized = path.resolve(modelPath);
  const base = path.basename(normalized).replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
  const digest = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12);
  return `lm_${base}_${digest}`;
}

function digestForPath(modelPath: string): string {
  return crypto.createHash('sha256').update(path.resolve(modelPath)).digest('hex');
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function rate(attempts: LocalModelAttemptInput[], predicate: (attempt: LocalModelAttemptInput) => boolean): number {
  if (attempts.length === 0) return 0;
  return Math.round((attempts.filter(predicate).length / attempts.length) * 10_000) / 10_000;
}

export function computeRollingScorecard(
  modelId: string,
  task: LocalModelTask,
  attempts: LocalModelAttemptInput[],
  now = Date.now(),
): LocalModelScorecard {
  const completionSuccess = rate(attempts, (attempt) => attempt.completed);
  const designSuccess = rate(attempts, (attempt) => attempt.designPassed);
  const userSuccess = rate(attempts, (attempt) => attempt.userMarkedSuccess);
  const timeoutRate = rate(attempts, (attempt) => attempt.timedOut);
  const crashRate = rate(attempts, (attempt) => attempt.crashed);
  const latencies = attempts.filter((attempt) => attempt.completed).map((attempt) => attempt.latencyMs);
  const medianLatencyMs = median(latencies);
  const performanceScore =
    medianLatencyMs == null ? 0 : Math.max(0, Math.min(1, 1 - medianLatencyMs / 120_000));

  return {
    modelId,
    task,
    attempts: attempts.length,
    completionSuccess,
    designSuccess,
    userSuccess,
    performanceScore: Math.round(performanceScore * 10_000) / 10_000,
    overallSuccess: computeLocalModelOverallSuccess({
      completionSuccess,
      designSuccess,
      userSuccess,
      performanceScore,
    }),
    medianLatencyMs,
    timeoutRate,
    crashRate,
    updatedAt: now,
  };
}

export async function scanLocalModels(root = DEFAULT_LOCAL_MODEL_ROOT, opts: { now?: number } = {}): Promise<LocalModelRecord[]> {
  const now = opts.now ?? Date.now();
  const ggufRoot = path.basename(root).toLowerCase() === 'gguf' ? root : path.join(root, 'GGUF');
  const entries = await fs.readdir(ggufRoot, { withFileTypes: true });
  const models: LocalModelRecord[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.gguf')) continue;
    const modelPath = path.join(ggufRoot, entry.name);
    const stat = await fs.stat(modelPath);
    models.push({
      id: localModelIdForPath(modelPath),
      name: entry.name.replace(/\.gguf$/i, ''),
      fileName: entry.name,
      path: modelPath,
      sizeBytes: stat.size,
      mtimeMs: stat.mtimeMs,
      digest: digestForPath(modelPath),
      roles: inferLocalModelRoles(entry.name),
      enabled: true,
      discoveredAt: now,
      updatedAt: now,
    });
  }

  models.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return models;
}

export function migrateLocalModels(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      size_bytes INTEGER NOT NULL,
      mtime_ms REAL NOT NULL,
      digest TEXT NOT NULL,
      roles_json TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      discovered_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_model_runs (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      task TEXT NOT NULL,
      latency_ms INTEGER NOT NULL,
      completed INTEGER NOT NULL,
      design_passed INTEGER NOT NULL,
      user_marked_success INTEGER NOT NULL,
      timed_out INTEGER NOT NULL,
      crashed INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (model_id) REFERENCES local_models(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS local_model_scorecards (
      model_id TEXT NOT NULL,
      task TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      completion_success REAL NOT NULL,
      design_success REAL NOT NULL,
      user_success REAL NOT NULL,
      performance_score REAL NOT NULL,
      overall_success REAL NOT NULL,
      median_latency_ms INTEGER,
      timeout_rate REAL NOT NULL,
      crash_rate REAL NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (model_id, task),
      FOREIGN KEY (model_id) REFERENCES local_models(id) ON DELETE CASCADE
    );
  `);
}

export function upsertLocalModels(db: SqliteDb, models: LocalModelRecord[]): void {
  const stmt = db.prepare(`
    INSERT INTO local_models (
      id, name, file_name, path, size_bytes, mtime_ms, digest, roles_json,
      enabled, discovered_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      stmt.run(
        model.id,
        model.name,
        model.fileName,
        model.path,
        model.sizeBytes,
        model.mtimeMs,
        model.digest,
        JSON.stringify(model.roles),
        model.enabled ? 1 : 0,
        model.discoveredAt,
        model.updatedAt,
      );
    }
  });

  tx(models);
}

export function listLocalModels(db: SqliteDb): LocalModelRecord[] {
  const rows = db.prepare(`SELECT * FROM local_models ORDER BY file_name COLLATE NOCASE`).all() as any[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    fileName: row.file_name,
    path: row.path,
    sizeBytes: row.size_bytes,
    mtimeMs: row.mtime_ms,
    digest: row.digest,
    roles: JSON.parse(row.roles_json),
    enabled: row.enabled === 1,
    discoveredAt: row.discovered_at,
    updatedAt: row.updated_at,
  }));
}

export function setLocalModelEnabled(db: SqliteDb, id: string, enabled: boolean): LocalModelRecord | null {
  db.prepare(`UPDATE local_models SET enabled = ?, updated_at = ? WHERE id = ?`).run(enabled ? 1 : 0, Date.now(), id);
  return listLocalModels(db).find((model) => model.id === id) ?? null;
}

export function listLocalModelScorecards(db: SqliteDb): LocalModelScorecard[] {
  const rows = db.prepare(`SELECT * FROM local_model_scorecards ORDER BY overall_success DESC, model_id ASC`).all() as any[];
  return rows.map((row) => ({
    modelId: row.model_id,
    task: row.task,
    attempts: row.attempts,
    completionSuccess: row.completion_success,
    designSuccess: row.design_success,
    userSuccess: row.user_success,
    performanceScore: row.performance_score,
    overallSuccess: row.overall_success,
    medianLatencyMs: row.median_latency_ms,
    timeoutRate: row.timeout_rate,
    crashRate: row.crash_rate,
    updatedAt: row.updated_at,
  }));
}
```

- [ ] **Step 4: Verify daemon service tests pass**

Run:

```bash
pnpm --filter @open-design/daemon test apps/daemon/tests/local-models.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit daemon service**

Run:

```bash
git add apps/daemon/src/local-models.ts apps/daemon/tests/local-models.test.ts
git commit -m "feat(daemon): add local model scanner service"
```

## Task 3: Persistence Migration

**Files:**

- Modify: `apps/daemon/src/db.ts`
- Test: `apps/daemon/tests/local-models.test.ts`

- [ ] **Step 1: Extend the daemon test with persistence coverage**

Append this test to `apps/daemon/tests/local-models.test.ts`:

```ts
import Database from 'better-sqlite3';
import {
  listLocalModels,
  migrateLocalModels,
  setLocalModelEnabled,
  upsertLocalModels,
} from '../src/local-models.js';

describe('local model persistence', () => {
  it('persists scanned models and preserves manual enabled state on rescan', async () => {
    const db = new Database(':memory:');
    migrateLocalModels(db);

    const root = makeTempDir();
    const ggufDir = path.join(root, 'GGUF');
    await mkdir(ggufDir, { recursive: true });
    await writeFile(path.join(ggufDir, 'Llama-3.2-1B-Instruct-Q4_K_M.gguf'), 'model-bytes');

    const firstScan = await scanLocalModels(root, { now: 1779757200000 });
    upsertLocalModels(db, firstScan);
    expect(listLocalModels(db)).toHaveLength(1);

    const disabled = setLocalModelEnabled(db, firstScan[0].id, false);
    expect(disabled?.enabled).toBe(false);

    const secondScan = await scanLocalModels(root, { now: 1779757300000 });
    upsertLocalModels(db, secondScan);

    expect(listLocalModels(db)[0].enabled).toBe(false);
    db.close();
  });
});
```

- [ ] **Step 2: Run the persistence test**

Run:

```bash
pnpm --filter @open-design/daemon test apps/daemon/tests/local-models.test.ts
```

Expected: FAIL if `upsertLocalModels` overwrites `enabled` on conflict.

- [ ] **Step 3: Preserve manual enabled state**

In `apps/daemon/src/local-models.ts`, change the conflict update in `upsertLocalModels` so `enabled` is not overwritten:

```sql
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  file_name = excluded.file_name,
  path = excluded.path,
  size_bytes = excluded.size_bytes,
  mtime_ms = excluded.mtime_ms,
  digest = excluded.digest,
  roles_json = excluded.roles_json,
  updated_at = excluded.updated_at
```

If the implementation already matches this SQL, the test should pass without a source edit.

- [ ] **Step 4: Wire migration into database startup**

Modify `apps/daemon/src/db.ts`:

```ts
import { migrateLocalModels } from './local-models.js';
```

Inside `migrate(db)`, after `migrateMediaTasks(db);`, add:

```ts
migrateLocalModels(db);
```

- [ ] **Step 5: Verify persistence**

Run:

```bash
pnpm --filter @open-design/daemon test apps/daemon/tests/local-models.test.ts
pnpm --filter @open-design/daemon test apps/daemon/tests/storage-db-verify.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit persistence**

Run:

```bash
git add apps/daemon/src/db.ts apps/daemon/src/local-models.ts apps/daemon/tests/local-models.test.ts
git commit -m "feat(daemon): persist local model inventory"
```

## Task 4: HTTP Routes

**Files:**

- Create: `apps/daemon/src/local-model-routes.ts`
- Modify: `apps/daemon/src/server.ts`
- Test: `apps/daemon/tests/local-model-routes.test.ts`

- [ ] **Step 1: Write failing route tests**

Create `apps/daemon/tests/local-model-routes.test.ts`:

```ts
import type http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

describe('local model routes', () => {
  let server: http.Server;
  let baseUrl: string;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  async function makeModelRoot(): Promise<string> {
    const root = mkdtempSync(path.join(os.tmpdir(), 'od-local-model-routes-'));
    tempDirs.push(root);
    await mkdir(path.join(root, 'GGUF'), { recursive: true });
    await writeFile(path.join(root, 'GGUF', 'Qwen2.5-14B-Instruct-Q4_K_M.gguf'), 'model-bytes');
    return root;
  }

  it('scans, lists, patches, and returns scorecards', async () => {
    const root = await makeModelRoot();

    const scanResp = await fetch(`${baseUrl}/api/local-models/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root }),
    });
    expect(scanResp.status).toBe(200);
    const scanBody = await scanResp.json() as { models: Array<{ id: string; enabled: boolean }> };
    expect(scanBody.models).toHaveLength(1);
    expect(scanBody.models[0].enabled).toBe(true);

    const listResp = await fetch(`${baseUrl}/api/local-models`);
    expect(listResp.status).toBe(200);
    const listBody = await listResp.json() as { models: Array<{ id: string }> };
    expect(listBody.models.map((model) => model.id)).toEqual([scanBody.models[0].id]);

    const patchResp = await fetch(`${baseUrl}/api/local-models/${scanBody.models[0].id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    expect(patchResp.status).toBe(200);
    const patchBody = await patchResp.json() as { model: { enabled: boolean } };
    expect(patchBody.model.enabled).toBe(false);

    const scoreResp = await fetch(`${baseUrl}/api/local-models/scorecards`);
    expect(scoreResp.status).toBe(200);
    const scoreBody = await scoreResp.json() as { scorecards: unknown[] };
    expect(scoreBody.scorecards).toEqual([]);
  });

  it('rejects invalid patch payloads', async () => {
    const resp = await fetch(`${baseUrl}/api/local-models/does-not-matter`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: 'no' }),
    });
    expect(resp.status).toBe(400);
    const body = await resp.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
  });
});
```

- [ ] **Step 2: Run failing route tests**

Run:

```bash
pnpm --filter @open-design/daemon test apps/daemon/tests/local-model-routes.test.ts
```

Expected: FAIL because `/api/local-models` routes are not registered.

- [ ] **Step 3: Add route registrar**

Create `apps/daemon/src/local-model-routes.ts`:

```ts
import type express from 'express';
import type { Database as SqliteDb } from 'better-sqlite3';
import {
  LocalModelPatchRequest,
  type LocalModelListResponse,
  type LocalModelScanResponse,
  type LocalModelScorecardsResponse,
} from '@open-design/contracts';
import {
  DEFAULT_LOCAL_MODEL_ROOT,
  listLocalModelScorecards,
  listLocalModels,
  scanLocalModels,
  setLocalModelEnabled,
  upsertLocalModels,
} from './local-models.js';

function sendApiError(res: express.Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

export function registerLocalModelRoutes(app: express.Express, deps: { db: SqliteDb }): void {
  app.get('/api/local-models', (_req, res) => {
    const body: LocalModelListResponse = { models: listLocalModels(deps.db) };
    res.json(body);
  });

  app.post('/api/local-models/scan', async (req, res) => {
    try {
      const root = typeof req.body?.root === 'string' && req.body.root.trim()
        ? req.body.root.trim()
        : DEFAULT_LOCAL_MODEL_ROOT;
      const models = await scanLocalModels(root);
      upsertLocalModels(deps.db, models);
      const body: LocalModelScanResponse = { root, models: listLocalModels(deps.db), scannedAt: Date.now() };
      res.json(body);
    } catch (error) {
      sendApiError(res, 400, 'LOCAL_MODEL_SCAN_FAILED', error instanceof Error ? error.message : String(error));
    }
  });

  app.patch('/api/local-models/:id', (req, res) => {
    const body = req.body as LocalModelPatchRequest;
    if (typeof body?.enabled !== 'boolean') {
      return sendApiError(res, 400, 'BAD_REQUEST', 'enabled must be a boolean');
    }
    const model = setLocalModelEnabled(deps.db, req.params.id, body.enabled);
    if (!model) return sendApiError(res, 404, 'LOCAL_MODEL_NOT_FOUND', 'local model not found');
    res.json({ model });
  });

  app.get('/api/local-models/scorecards', (_req, res) => {
    const body: LocalModelScorecardsResponse = { scorecards: listLocalModelScorecards(deps.db) };
    res.json(body);
  });
}
```

- [ ] **Step 4: Register routes in server**

Modify `apps/daemon/src/server.ts`.

Add import near other route imports:

```ts
import { registerLocalModelRoutes } from './local-model-routes.js';
```

After `db` is initialized and before project routes, register:

```ts
registerLocalModelRoutes(app, { db });
```

Place it near other domain route registrations, not inside an unrelated route block.

- [ ] **Step 5: Verify route tests**

Run:

```bash
pnpm --filter @open-design/daemon test apps/daemon/tests/local-model-routes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit routes**

Run:

```bash
git add apps/daemon/src/local-model-routes.ts apps/daemon/src/server.ts apps/daemon/tests/local-model-routes.test.ts
git commit -m "feat(daemon): expose local model inventory routes"
```

## Task 5: CLI Commands

**Files:**

- Modify: `apps/daemon/src/cli.ts`
- Test: `apps/daemon/tests/local-models-cli.test.ts`

- [ ] **Step 1: Write CLI tests**

Create `apps/daemon/tests/local-models-cli.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/cli.ts');

describe('od model CLI', () => {
  it('prints help for model commands', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', cliPath, 'model', '--help'], {
      encoding: 'utf8',
      env: { ...process.env, OD_DAEMON_URL: 'http://127.0.0.1:9' },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('od model scan');
    expect(result.stdout).toContain('od model scorecard');
  });

  it('requires a subcommand', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', cliPath, 'model'], {
      encoding: 'utf8',
      env: { ...process.env, OD_DAEMON_URL: 'http://127.0.0.1:9' },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('usage: od model');
  });
});
```

- [ ] **Step 2: Run failing CLI tests**

Run:

```bash
pnpm --filter @open-design/daemon test apps/daemon/tests/local-models-cli.test.ts
```

Expected: FAIL because `model` is not in `SUBCOMMAND_MAP`.

- [ ] **Step 3: Add model CLI routing**

Modify `apps/daemon/src/cli.ts`.

Add flag sets near other hoisted flag sets:

```ts
const MODEL_STRING_FLAGS = new Set(['daemon-url', 'root', 'task']);
const MODEL_BOOLEAN_FLAGS = new Set(['help', 'h', 'json']);
```

Add to `SUBCOMMAND_MAP`:

```ts
model: runModel,
```

Add this function near the other CLI handlers:

```ts
async function runModel(args) {
  const [cmd, ...rest] = args;
  if (!cmd || cmd === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: od model <command> [options]

Commands:
  od model scan [--root <path>] [--json] [--daemon-url <url>]
  od model list [--json] [--daemon-url <url>]
  od model scorecard [--task <task>] [--json] [--daemon-url <url>]
  od model enable <model-id> [--json] [--daemon-url <url>]
  od model disable <model-id> [--json] [--daemon-url <url>]
`);
    process.exitCode = cmd ? 0 : 1;
    return;
  }

  const flags = parseFlags(rest, { string: MODEL_STRING_FLAGS, boolean: MODEL_BOOLEAN_FLAGS });
  const daemonUrl = await daemonUrlFromFlags(flags);
  const json = Boolean(flags.json);
  const write = (value) => {
    if (json) {
      console.log(JSON.stringify(value, null, 2));
    } else {
      console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    }
  };

  if (cmd === 'scan') {
    const resp = await fetch(`${daemonUrl}/api/local-models/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(flags.root ? { root: flags.root } : {}),
    });
    const body = await resp.json();
    if (!resp.ok) throw new Error(body?.error?.message || 'local model scan failed');
    write(body);
    return;
  }

  if (cmd === 'list') {
    const resp = await fetch(`${daemonUrl}/api/local-models`);
    const body = await resp.json();
    if (!resp.ok) throw new Error(body?.error?.message || 'local model list failed');
    write(body);
    return;
  }

  if (cmd === 'scorecard') {
    const resp = await fetch(`${daemonUrl}/api/local-models/scorecards`);
    const body = await resp.json();
    if (!resp.ok) throw new Error(body?.error?.message || 'local model scorecard failed');
    const scorecards = flags.task
      ? body.scorecards.filter((card) => card.task === flags.task)
      : body.scorecards;
    write({ scorecards });
    return;
  }

  if (cmd === 'enable' || cmd === 'disable') {
    const id = rest.find((arg) => !arg.startsWith('-') && arg !== flags['daemon-url'] && arg !== flags.root && arg !== flags.task);
    if (!id) throw new Error(`usage: od model ${cmd} <model-id> [--json]`);
    const resp = await fetch(`${daemonUrl}/api/local-models/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: cmd === 'enable' }),
    });
    const body = await resp.json();
    if (!resp.ok) throw new Error(body?.error?.message || `local model ${cmd} failed`);
    write(body);
    return;
  }

  throw new Error(`unknown model command: ${cmd}`);
}
```

- [ ] **Step 4: Verify CLI tests**

Run:

```bash
pnpm --filter @open-design/daemon test apps/daemon/tests/local-models-cli.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit CLI**

Run:

```bash
git add apps/daemon/src/cli.ts apps/daemon/tests/local-models-cli.test.ts
git commit -m "feat(cli): add local model commands"
```

## Task 6: Web Data Helpers and Minimal Settings Panel

**Files:**

- Create: `apps/web/src/state/local-models.ts`
- Create: `apps/web/src/components/LocalModelsSection.tsx`
- Modify: `apps/web/src/components/SettingsDialog.tsx`
- Test: `apps/web/tests/state/local-models.test.ts`
- Test: `apps/web/tests/components/local-models-section.test.tsx`

- [ ] **Step 1: Write web state tests**

Create `apps/web/tests/state/local-models.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listLocalModels, scanLocalModels, setLocalModelEnabled } from '../../src/state/local-models';

describe('local model web state helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists local models', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ models: [{ id: 'lm_test', enabled: true }] }),
    })));

    await expect(listLocalModels()).resolves.toEqual([{ id: 'lm_test', enabled: true }]);
    expect(fetch).toHaveBeenCalledWith('/api/local-models');
  });

  it('scans with the supplied root', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ root: '/models', models: [], scannedAt: 1 }),
    })));

    await expect(scanLocalModels('/models')).resolves.toEqual({ root: '/models', models: [], scannedAt: 1 });
    expect(fetch).toHaveBeenCalledWith('/api/local-models/scan', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ root: '/models' }),
    }));
  });

  it('patches enabled state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ model: { id: 'lm_test', enabled: false } }),
    })));

    await expect(setLocalModelEnabled('lm_test', false)).resolves.toEqual({ id: 'lm_test', enabled: false });
  });
});
```

- [ ] **Step 2: Run failing web state tests**

Run:

```bash
pnpm --filter @open-design/web test apps/web/tests/state/local-models.test.ts
```

Expected: FAIL because `src/state/local-models.ts` does not exist.

- [ ] **Step 3: Add web state helpers**

Create `apps/web/src/state/local-models.ts`:

```ts
import type {
  LocalModelListResponse,
  LocalModelPatchResponse,
  LocalModelRecord,
  LocalModelScanResponse,
  LocalModelScorecardsResponse,
} from '@open-design/contracts';

async function readJson<T>(resp: Response, fallback: string): Promise<T> {
  const body = await resp.json();
  if (!resp.ok) {
    throw new Error(body?.error?.message || fallback);
  }
  return body as T;
}

export async function listLocalModels(): Promise<LocalModelRecord[]> {
  const resp = await fetch('/api/local-models');
  const body = await readJson<LocalModelListResponse>(resp, 'Failed to list local models');
  return body.models;
}

export async function scanLocalModels(root: string): Promise<LocalModelScanResponse> {
  const resp = await fetch('/api/local-models/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ root }),
  });
  return readJson<LocalModelScanResponse>(resp, 'Failed to scan local models');
}

export async function listLocalModelScorecards(): Promise<LocalModelScorecardsResponse> {
  const resp = await fetch('/api/local-models/scorecards');
  return readJson<LocalModelScorecardsResponse>(resp, 'Failed to list local model scorecards');
}

export async function setLocalModelEnabled(id: string, enabled: boolean): Promise<LocalModelRecord> {
  const resp = await fetch(`/api/local-models/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  const body = await readJson<LocalModelPatchResponse>(resp, 'Failed to update local model');
  return body.model;
}
```

- [ ] **Step 4: Add minimal settings component**

Create `apps/web/src/components/LocalModelsSection.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import type { LocalModelRecord, LocalModelScorecard } from '@open-design/contracts';
import {
  listLocalModelScorecards,
  listLocalModels,
  scanLocalModels,
  setLocalModelEnabled,
} from '../state/local-models';

const DEFAULT_ROOT = '/Users/Antman/Desktop/AI_Models';

export function LocalModelsSection() {
  const [root, setRoot] = useState(DEFAULT_ROOT);
  const [models, setModels] = useState<LocalModelRecord[]>([]);
  const [scorecards, setScorecards] = useState<LocalModelScorecard[]>([]);
  const [status, setStatus] = useState<string>('Idle');
  const [error, setError] = useState<string | null>(null);

  const scoreByModel = useMemo(() => {
    const map = new Map<string, LocalModelScorecard>();
    for (const card of scorecards) {
      const existing = map.get(card.modelId);
      if (!existing || card.overallSuccess > existing.overallSuccess) map.set(card.modelId, card);
    }
    return map;
  }, [scorecards]);

  async function refresh() {
    const [nextModels, nextCards] = await Promise.all([
      listLocalModels(),
      listLocalModelScorecards().then((body) => body.scorecards),
    ]);
    setModels(nextModels);
    setScorecards(nextCards);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function onScan() {
    setStatus('Scanning');
    setError(null);
    try {
      const result = await scanLocalModels(root);
      setModels(result.models);
      await refresh();
      setStatus(`Found ${result.models.length} models`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('Scan failed');
    }
  }

  async function onToggle(model: LocalModelRecord) {
    const updated = await setLocalModelEnabled(model.id, !model.enabled);
    setModels((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  }

  return (
    <section className="settings-section local-models-section">
      <div className="settings-field">
        <label htmlFor="local-model-root">Model folder</label>
        <input
          id="local-model-root"
          value={root}
          onChange={(event) => setRoot(event.target.value)}
        />
        <button type="button" onClick={() => void onScan()}>Scan</button>
      </div>
      <p role="status">{status}</p>
      {error ? <p role="alert">{error}</p> : null}
      <div className="settings-list">
        {models.map((model) => {
          const score = scoreByModel.get(model.id);
          return (
            <div className="settings-list-row" key={model.id}>
              <div>
                <strong>{model.name}</strong>
                <small>{model.roles.join(', ')} · {formatBytes(model.sizeBytes)}</small>
              </div>
              <div>
                <span>{score ? `${Math.round(score.overallSuccess * 100)}%` : 'No score'}</span>
                <button type="button" onClick={() => void onToggle(model)}>
                  {model.enabled ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}
```

- [ ] **Step 5: Mount in SettingsDialog**

Modify `apps/web/src/components/SettingsDialog.tsx`.

Import:

```ts
import { LocalModelsSection } from './LocalModelsSection';
```

Add to `SettingsSection` union:

```ts
| 'local-models'
```

Add a `sectionHeader` entry:

```ts
'local-models': { title: 'Local Models', subtitle: 'Scan local GGUF models and review scorecards.' },
```

Add a nav item near execution/model settings:

```tsx
<button
  type="button"
  className={`settings-nav-item${activeSection === 'local-models' ? ' active' : ''}`}
  onClick={() => setActiveSection('local-models')}
>
  <strong>Local Models</strong>
  <small>GGUF model pool</small>
</button>
```

Add the panel render branch:

```tsx
{activeSection === 'local-models' ? <LocalModelsSection /> : null}
```

- [ ] **Step 6: Add component smoke test**

Create `apps/web/tests/components/local-models-section.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalModelsSection } from '../../src/components/LocalModelsSection';

describe('LocalModelsSection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders existing local models', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => {
        if (url.endsWith('/scorecards')) return { scorecards: [] };
        return {
          models: [{
            id: 'lm_test',
            name: 'Qwen3-Coder',
            fileName: 'Qwen3-Coder.gguf',
            path: '/models/Qwen3-Coder.gguf',
            sizeBytes: 1024,
            mtimeMs: 1,
            digest: '12345678',
            roles: ['code'],
            enabled: true,
            discoveredAt: 1,
            updatedAt: 1,
          }],
        };
      },
    })));

    render(<LocalModelsSection />);

    expect(await screen.findByText('Qwen3-Coder')).toBeTruthy();
    expect(screen.getByText('Disable')).toBeTruthy();
  });
});
```

- [ ] **Step 7: Verify web tests**

Run:

```bash
pnpm --filter @open-design/web test apps/web/tests/state/local-models.test.ts apps/web/tests/components/local-models-section.test.tsx
pnpm --filter @open-design/web typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit web surface**

Run:

```bash
git add apps/web/src/state/local-models.ts apps/web/src/components/LocalModelsSection.tsx apps/web/src/components/SettingsDialog.tsx apps/web/tests/state/local-models.test.ts apps/web/tests/components/local-models-section.test.tsx
git commit -m "feat(web): add local models settings surface"
```

## Task 7: Phase 1 Verification

**Files:**

- No new files.

- [ ] **Step 1: Run focused test suites**

Run:

```bash
pnpm --filter @open-design/contracts test packages/contracts/tests/local-models.test.ts
pnpm --filter @open-design/daemon test apps/daemon/tests/local-models.test.ts apps/daemon/tests/local-model-routes.test.ts apps/daemon/tests/local-models-cli.test.ts
pnpm --filter @open-design/web test apps/web/tests/state/local-models.test.ts apps/web/tests/components/local-models-section.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typechecks**

Run:

```bash
pnpm --filter @open-design/contracts typecheck
pnpm --filter @open-design/daemon typecheck
pnpm --filter @open-design/web typecheck
```

Expected: PASS.

- [ ] **Step 3: Run repo guard**

Run:

```bash
pnpm guard
```

Expected: PASS.

- [ ] **Step 4: Manual local scan smoke**

Start the app:

```bash
pnpm tools-dev run web --daemon-port 17456 --web-port 17573
```

In another shell:

```bash
pnpm --filter @open-design/daemon build
node apps/daemon/dist/cli.js model scan --root /Users/Antman/Desktop/AI_Models --json --daemon-url http://127.0.0.1:17456
node apps/daemon/dist/cli.js model list --json --daemon-url http://127.0.0.1:17456
```

Expected:

- Scan returns the GGUF models under `/Users/Antman/Desktop/AI_Models/GGUF`.
- List returns the same models with stable ids.
- The `nomic-embed-text` model has role `embedding`.
- Coder models have roles `code` and `repair`.

- [ ] **Step 5: Commit final verification note if needed**

If verification required small fixes, commit them:

```bash
git status --short
git add <changed-files>
git commit -m "fix: stabilize local model phase 1"
```

If no fixes were needed, do not create an empty commit.

## Plan Self-Review

Spec coverage:

- Model discovery is covered by Tasks 1-4.
- Scorecard formula and persistence are covered by Tasks 1-3.
- HTTP and CLI parity are covered by Tasks 4-5.
- Web visibility is covered by Task 6.
- Local model runner, source indexing, and design-run routing are intentionally deferred to separate plans because they are independent subsystems with different failure modes.

Placeholder scan:

- No task depends on undefined future code.
- Every new test has the implementation files named.
- Every command has expected output.

Type consistency:

- Contract field names use camelCase.
- SQLite field names use snake_case and map back to contract DTOs in `apps/daemon/src/local-models.ts`.
- Route response names match the exported contract names.
