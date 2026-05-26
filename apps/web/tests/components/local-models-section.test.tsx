// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocalModelsSection } from '../../src/components/LocalModelsSection';

const originalFetch = globalThis.fetch;

const model = {
  id: 'lm_qwen3_coder',
  name: 'Qwen3-Coder',
  fileName: 'Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf',
  path: '/models/Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf',
  sizeBytes: 1024,
  mtimeMs: 1,
  digest: 'digest123',
  roles: ['code', 'repair'],
  enabled: true,
  discoveredAt: 1,
  updatedAt: 1,
};

describe('LocalModelsSection', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', originalFetch);
  });

  it('loads local models and renders enabled model controls', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/local-models/scorecards') {
        return new Response(JSON.stringify({ scorecards: [] }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/local-models') {
        return new Response(JSON.stringify({ models: [model] }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }));

    render(<LocalModelsSection />);

    expect(await screen.findByText('Qwen3-Coder')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disable Qwen3-Coder' })).toBeTruthy();
  });
});
