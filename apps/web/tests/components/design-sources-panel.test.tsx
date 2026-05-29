// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DesignSourcesPanel } from '../../src/components/DesignSourcesPanel';

const originalFetch = globalThis.fetch;

describe('DesignSourcesPanel', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', originalFetch);
  });

  it('shows all sources on demand and forwards selected uploads to the file uploader', async () => {
    const upload = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString() === '/api/projects/project-a/sources') {
        return new Response(JSON.stringify({
          sources: Array.from({ length: 7 }, (_unused, index) => ({
            id: `src-${index}`,
            projectId: 'project-a',
            path: `source-${index}.md`,
            name: `source-${index}.md`,
            kind: 'text',
            mime: 'text/markdown',
            sizeBytes: 10,
            status: 'indexed',
            summary: '1 indexed chunk(s)',
            chunkCount: 1,
            createdAt: 1,
            updatedAt: 1,
          })),
        }), { headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }));

    render(<DesignSourcesPanel projectId="project-a" onUploadFiles={upload} />);

    expect(await screen.findByText('source-0.md')).toBeTruthy();
    expect(screen.queryByText('source-6.md')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /show all 7 sources/i }));
    expect(screen.getByText('source-6.md')).toBeTruthy();

    const input = screen.getByLabelText('Upload design sources') as HTMLInputElement;
    const file = new File(['brand'], 'brand.md', { type: 'text/markdown' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(upload).toHaveBeenCalledWith([file]));
  });
});
