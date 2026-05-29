import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  indexProjectSources,
  listProjectSources,
  previewProjectSourceRetrieval,
} from '../../src/state/project-sources';

const originalFetch = globalThis.fetch;

describe('project source state helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', originalFetch);
  });

  it('lists, indexes, and previews source retrieval', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/projects/project-a/sources') {
        return new Response(JSON.stringify({ sources: [] }));
      }
      if (url === '/api/projects/project-a/sources/index') {
        expect(init?.method).toBe('POST');
        return new Response(JSON.stringify({ sources: [], indexedAt: 1 }));
      }
      if (url.endsWith('/api/projects/project-a/sources/retrieval-preview?query=brand')) {
        return new Response(JSON.stringify({ query: 'brand', chunks: [], context: '', generatedAt: 1 }));
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(listProjectSources('project-a')).resolves.toEqual({ sources: [] });
    await expect(indexProjectSources('project-a')).resolves.toEqual({ sources: [], indexedAt: 1 });
    await expect(previewProjectSourceRetrieval('project-a', 'brand')).resolves.toEqual({
      query: 'brand',
      chunks: [],
      context: '',
      generatedAt: 1,
    });
  });
});
