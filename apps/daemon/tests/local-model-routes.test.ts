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
    const scanBody = await scanResp.json() as { root: string; models: Array<{ id: string; enabled: boolean }> };
    expect(scanBody.root).toBe(root);
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
