import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  listLocalModels,
  scanLocalModels,
  setLocalModelEnabled,
} from '../../src/state/local-models';

const originalFetch = globalThis.fetch;

const model = {
  id: 'lm_test',
  name: 'Test Model',
  fileName: 'test.gguf',
  path: '/models/test.gguf',
  sizeBytes: 1024,
  mtimeMs: 1,
  digest: 'digest123',
  roles: ['design'],
  enabled: true,
  discoveredAt: 1,
  updatedAt: 1,
};

describe('local model state helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', originalFetch);
  });

  it('listLocalModels fetches local models and returns body.models', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ models: [model] })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listLocalModels()).resolves.toEqual([model]);

    expect(fetchMock).toHaveBeenCalledWith('/api/local-models');
  });

  it('listLocalModels uses the fallback error when an error response is not JSON', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listLocalModels()).rejects.toThrow('Failed to list local models');
  });

  it('scanLocalModels posts a scan root and returns the response body', async () => {
    const body = { root: '/models', models: [model], scannedAt: 1 };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body)));
    vi.stubGlobal('fetch', fetchMock);

    await expect(scanLocalModels('/models')).resolves.toEqual(body);

    expect(fetchMock).toHaveBeenCalledWith('/api/local-models/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root: '/models' }),
    });
  });

  it('setLocalModelEnabled patches the enabled flag and returns body.model', async () => {
    const disabled = { ...model, enabled: false };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ model: disabled })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(setLocalModelEnabled('lm/test id', false)).resolves.toEqual(disabled);

    expect(fetchMock).toHaveBeenCalledWith('/api/local-models/lm%2Ftest%20id', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
  });
});
