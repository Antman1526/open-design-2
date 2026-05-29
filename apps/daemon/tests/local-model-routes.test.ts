import type http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { LocalModelRecord } from '@open-design/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function eventually<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
): Promise<T> {
  let latest = await read();
  const deadline = Date.now() + 2000;
  while (!predicate(latest) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    latest = await read();
  }
  return latest;
}

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
    clearLocalModelTables();
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  async function makeModelRoot(): Promise<string> {
    const root = mkdtempSync(path.join(os.tmpdir(), 'od-local-model-routes-'));
    tempDirs.push(root);
    await mkdir(path.join(root, 'GGUF'), { recursive: true });
    await writeFile(path.join(root, 'GGUF', 'Qwen2.5-14B-Instruct-Q4_K_M.gguf'), 'model-bytes');
    return root;
  }

  function clearLocalModelTables(): void {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) return;
    const db = new Database(path.join(dataDir, 'app.sqlite'));
    db.prepare('DELETE FROM local_model_scorecards').run();
    db.prepare('DELETE FROM local_model_runs').run();
    db.prepare('DELETE FROM local_models').run();
    db.close();
  }

  it('detects new GGUF models during daemon startup when launch scanning is enabled', async () => {
    const root = await makeModelRoot();
    const started = (await startServer({
      port: 0,
      returnServer: true,
      autoScanLocalModels: true,
      localModelRoot: root,
    })) as {
      url: string;
      server: http.Server;
    };

    try {
      const body = await eventually(
        async () => {
          const resp = await fetch(`${started.url}/api/local-models`);
          expect(resp.status).toBe(200);
          return await resp.json() as { models: Array<{ fileName: string }> };
        },
        (value) => value.models.some((model) => model.fileName === 'Qwen2.5-14B-Instruct-Q4_K_M.gguf'),
      );
      expect(body.models.map((model) => model.fileName)).toContain('Qwen2.5-14B-Instruct-Q4_K_M.gguf');
    } finally {
      await new Promise<void>((resolve) => started.server.close(() => resolve()));
    }
  });

  it('starts listening before the launch model scan completes and exposes scan status', async () => {
    const root = await makeModelRoot();
    const pending = deferred<{
      root: string;
      models: LocalModelRecord[];
      scannedModels: LocalModelRecord[];
      scannedAt: number;
    }>();
    const started = (await startServer({
      port: 0,
      returnServer: true,
      autoScanLocalModels: true,
      localModelRoot: root,
      localModelStartupScan: () => pending.promise,
    })) as {
      url: string;
      server: http.Server;
    };

    try {
      const runningResp = await fetch(`${started.url}/api/local-models/scan-status`);
      expect(runningResp.status).toBe(200);
      const running = await runningResp.json() as { status: string; root: string };
      expect(running).toMatchObject({ status: 'running', root });

      pending.resolve({ root, models: [], scannedModels: [], scannedAt: Date.now() });
    } finally {
      await new Promise<void>((resolve) => started.server.close(() => resolve()));
    }
  });

  it('scans, lists, patches, and returns scorecards', async () => {
    const root = await makeModelRoot();

    const scanResp = await fetch(`${baseUrl}/api/local-models/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root }),
    });
    expect(scanResp.status).toBe(200);
    const scanBody = await scanResp.json() as {
      root: string;
      scannedModels: Array<{ id: string }>;
      models: Array<{ id: string; enabled: boolean }>;
    };
    expect(scanBody.root).toBe(root);
    expect(scanBody.scannedModels).toHaveLength(1);
    expect(scanBody.models).toHaveLength(1);
    const scannedModel = scanBody.models[0];
    if (!scannedModel) throw new Error('expected scanned model');
    expect(scannedModel.enabled).toBe(true);

    const listResp = await fetch(`${baseUrl}/api/local-models`);
    expect(listResp.status).toBe(200);
    const listBody = await listResp.json() as { models: Array<{ id: string }> };
    expect(listBody.models.map((model) => model.id)).toEqual([scannedModel.id]);

    const patchResp = await fetch(`${baseUrl}/api/local-models/${scannedModel.id}`, {
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

  it('returns setup diagnostics for a local model root', async () => {
    const root = await makeModelRoot();
    const resp = await fetch(`${baseUrl}/api/local-models/diagnostics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root, llamaServerBin: path.join(root, 'missing-llama-server') }),
    });

    expect(resp.status).toBe(200);
    const body = await resp.json() as {
      root: { readable: boolean };
      gguf: { readable: boolean };
      llamaServer: { available: boolean };
      modelCount: number;
    };
    expect(body.root.readable).toBe(true);
    expect(body.gguf.readable).toBe(true);
    expect(body.modelCount).toBe(1);
    expect(body.llamaServer.available).toBe(false);
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

  it('returns not found for unknown model tests', async () => {
    const resp = await fetch(`${baseUrl}/api/local-models/missing/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'design' }),
    });
    expect(resp.status).toBe(404);
    const body = await resp.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe('LOCAL_MODEL_NOT_FOUND');
  });
});
