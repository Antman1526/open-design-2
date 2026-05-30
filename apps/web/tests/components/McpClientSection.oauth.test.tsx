// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpClientSection } from '../../src/components/McpClientSection';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });
}

const kindlyTemplate = {
  id: 'kindly-web-search',
  label: 'Kindly Web Search',
  description: 'Web search plus content retrieval for coding and design research.',
  transport: 'stdio',
  category: 'web-research',
  homepage: 'https://github.com/Shelpuk-AI-Technology-Consulting/kindly-web-search-mcp-server',
  example: 'Search for current documentation on CSS anchor positioning.',
  command: 'uvx',
  args: [
    '--from',
    'git+https://github.com/Shelpuk-AI-Technology-Consulting/kindly-web-search-mcp-server',
    'kindly-web-search-mcp-server',
    'start-mcp-server',
  ],
  envFields: [
    { key: 'SERPER_API_KEY', label: 'Serper API key', secret: true },
    { key: 'TAVILY_API_KEY', label: 'Tavily API key', secret: true },
    { key: 'SEARXNG_BASE_URL', label: 'SearXNG base URL' },
    { key: 'SEARXNG_TIMEOUT_SECONDS', label: 'SearXNG timeout seconds' },
    { key: 'SEARXNG_USER_AGENT', label: 'SearXNG user agent' },
    { key: 'SEARXNG_HEADERS_JSON', label: 'SearXNG headers JSON' },
    { key: 'KINDLY_TOOL_TOTAL_TIMEOUT_SECONDS', label: 'Tool timeout seconds' },
    { key: 'KINDLY_WEB_SEARCH_MAX_CONCURRENCY', label: 'Search concurrency' },
  ],
} as const;

describe('McpClientSection OAuth controls', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/mcp/servers')) {
        return jsonResponse({
          servers: [
            {
              id: 'figma-use',
              label: 'figma-use',
              templateId: 'figma-use',
              transport: 'http',
              enabled: true,
              url: 'http://localhost:38451/mcp',
            },
          ],
          templates: [kindlyTemplate],
        });
      }
      if (url.startsWith('/api/mcp/oauth/status')) {
        return jsonResponse({ connected: false });
      }
      return jsonResponse({});
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('does not force managed OAuth for saved localhost HTTP MCP servers', async () => {
    render(<McpClientSection />);

    const expand = await screen.findByRole('button', {
      name: /Expand this MCP server/i,
    });
    fireEvent.click(expand);

    await waitFor(() => {
      expect(screen.getAllByText(/No managed OAuth/i).length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('button', { name: /^Connect$/i })).toBeNull();
  });

  it('infers no managed OAuth when a custom HTTP row is pointed at localhost', async () => {
    render(<McpClientSection />);

    fireEvent.click(await screen.findByRole('button', { name: /Add server/i }));
    fireEvent.click(screen.getByRole('button', { name: /Custom server/i }));
    const expandButtons = screen.getAllByRole('button', {
      name: /Expand this MCP server/i,
    });
    fireEvent.click(expandButtons[expandButtons.length - 1]!);

    fireEvent.change(screen.getByLabelText('Transport'), {
      target: { value: 'http' },
    });
    fireEvent.change(screen.getByLabelText('URL'), {
      target: { value: 'http://localhost:38451/mcp' },
    });

    await waitFor(() => {
      expect((screen.getByLabelText('OAuth mode') as HTMLSelectElement).value).toBe(
        'none',
      );
    });
    expect(screen.queryByRole('button', { name: /^Connect$/i })).toBeNull();
  });

  it('surfaces Kindly Web Search in the Web research template group', async () => {
    render(<McpClientSection />);

    fireEvent.click(await screen.findByRole('button', { name: /Add server/i }));

    const webResearchTitle = screen.getByText('Web research');
    expect(webResearchTitle).toBeTruthy();
    expect((webResearchTitle.closest('details') as HTMLDetailsElement | null)?.open).toBe(true);
    expect(screen.getByText(/Search and retrieve current external sources/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Kindly Web Search/i }));

    expect(await screen.findByRole('button', { name: /Kindly Web Search/i })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /Expand this MCP server/i }).at(-1)!);
    expect(screen.getByDisplayValue('uvx')).toBeTruthy();
    expect(screen.getByText(/SERPER_API_KEY=/)).toBeTruthy();
    expect(screen.getByText(/TAVILY_API_KEY=/)).toBeTruthy();
    expect(screen.getByText(/SEARXNG_BASE_URL=/)).toBeTruthy();
    expect(screen.getByText(/SEARXNG_TIMEOUT_SECONDS=/)).toBeTruthy();
    expect(screen.getByText(/KINDLY_TOOL_TOTAL_TIMEOUT_SECONDS=/)).toBeTruthy();
  });
});
