import { mkdir, stat, writeFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
  computeRollingScorecard,
  listLocalModels,
  localModelIdForPath,
  migrateLocalModels,
  scanLocalModels,
  setLocalModelEnabled,
  upsertLocalModels,
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
    const model = models[0];
    expect(model).toBeDefined();
    if (!model) throw new Error('expected one scanned model');
    expect(model).toMatchObject({
      fileName: 'Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf',
      name: 'Qwen3-Coder-30B-A3B-Instruct-Q4_K_M',
      roles: ['code', 'repair'],
      enabled: true,
      discoveredAt: 1779757200000,
    });
    expect(model.path).toBe(path.join(ggufDir, 'Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf'));
    expect(model.sizeBytes).toBe((await stat(model.path)).size);
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
      medianLatencyMs: 1000,
      timeoutRate: 0.5,
      crashRate: 0,
      updatedAt: 1779757200000,
    });
    expect(card.overallSuccess).toBeGreaterThan(0);
  });
});

describe('local model persistence', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists scanned models and preserves manual enabled state on rescan', async () => {
    const db = new Database(':memory:');
    migrateLocalModels(db);

    const root = makeTempDir();
    const ggufDir = path.join(root, 'GGUF');
    await mkdir(ggufDir, { recursive: true });
    await writeFile(path.join(ggufDir, 'Llama-3.2-1B-Instruct-Q4_K_M.gguf'), 'model-bytes');

    const firstScan = await scanLocalModels(root, { now: 1779757200000 });
    expect(firstScan).toHaveLength(1);
    const firstModel = firstScan[0];
    if (!firstModel) throw new Error('expected scan to return one local model');
    upsertLocalModels(db, firstScan);
    expect(listLocalModels(db)).toHaveLength(1);

    const disabled = setLocalModelEnabled(db, firstModel.id, false);
    expect(disabled?.enabled).toBe(false);

    const secondScan = await scanLocalModels(root, { now: 1779757300000 });
    upsertLocalModels(db, secondScan);

    const persisted = listLocalModels(db);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.enabled).toBe(false);
    db.close();
  });
});
