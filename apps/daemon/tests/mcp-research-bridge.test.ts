import { describe, expect, it, vi } from 'vitest';

import {
  McpResearchBridgeError,
  renderMcpResearchBridgePrompt,
  resolveMcpResearchBridge,
  selectMcpWebResearchServer,
  selectMcpWebResearchServers,
} from '../src/research/mcp-bridge.js';

describe('MCP research bridge', () => {
  it('selects enabled Kindly stdio servers as web research providers', () => {
    const servers = selectMcpWebResearchServers([
      {
        id: 'kindly-web-search',
        label: 'Kindly Web Search',
        templateId: 'kindly-web-search',
        transport: 'stdio',
        enabled: true,
        command: 'uvx',
      },
    ]);

    expect(servers.map((server) => server.id)).toEqual(['kindly-web-search']);
    expect(selectMcpWebResearchServer(servers)?.id).toBe('kindly-web-search');
  });

  it('falls back to the next enabled web research server when one fails', async () => {
    const callTool = vi
      .fn()
      .mockRejectedValueOnce(new Error('searx one unavailable'))
      .mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              results: [
                {
                  title: 'Fallback SearXNG result',
                  link: 'https://example.test/fallback',
                  snippet: 'The second SearXNG instance returned a result.',
                },
              ],
            }),
          },
        ],
      });

    const bridge = await resolveMcpResearchBridge({
      research: { enabled: true, query: 'fallback search', maxSources: 2 },
      message: 'ignored',
      servers: [
        {
          id: 'kindly-web-search-searx-a',
          templateId: 'kindly-web-search',
          transport: 'stdio',
          enabled: true,
          command: 'uvx',
          env: { SEARXNG_BASE_URL: 'https://searx.invalid/' },
        },
        {
          id: 'kindly-web-search-searx-b',
          templateId: 'kindly-web-search',
          transport: 'stdio',
          enabled: true,
          command: 'uvx',
          env: { SEARXNG_BASE_URL: 'https://searxng.example/' },
        },
      ],
      callTool,
    });

    expect(callTool).toHaveBeenCalledTimes(2);
    expect(callTool.mock.calls.map((call) => call[0].id)).toEqual([
      'kindly-web-search-searx-a',
      'kindly-web-search-searx-b',
    ]);
    expect(bridge?.server.id).toBe('kindly-web-search-searx-b');
    expect(bridge?.findings.sources[0]?.url).toBe('https://example.test/fallback');
    expect(bridge?.attempts).toEqual([
      { serverId: 'kindly-web-search-searx-a', ok: false, error: 'searx one unavailable' },
      { serverId: 'kindly-web-search-searx-b', ok: true, sourceCount: 1 },
    ]);
  });

  it('throws attempts when all web research servers fail or return no sources', async () => {
    const callTool = vi
      .fn()
      .mockRejectedValueOnce(new Error('first instance rate limited'))
      .mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ results: [] }),
          },
        ],
      });

    await expect(
      resolveMcpResearchBridge({
        research: { enabled: true, query: 'failing search' },
        message: 'ignored',
        servers: [
          {
            id: 'kindly-web-search-searx-a',
            templateId: 'kindly-web-search',
            transport: 'stdio',
            enabled: true,
            command: 'uvx',
          },
          {
            id: 'kindly-web-search-searx-b',
            templateId: 'kindly-web-search',
            transport: 'stdio',
            enabled: true,
            command: 'uvx',
          },
        ],
        callTool,
      }),
    ).rejects.toMatchObject({
      name: 'McpResearchBridgeError',
      attempts: [
        { serverId: 'kindly-web-search-searx-a', ok: false, error: 'first instance rate limited' },
        { serverId: 'kindly-web-search-searx-b', ok: false, error: 'no sources returned' },
      ],
    });
  });

  it('runs a web_search call and renders untrusted cited evidence', async () => {
    const callTool = vi.fn(async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            results: [
              {
                title: 'Local LLM MCP search',
                link: 'https://example.test/local-llm-mcp',
                snippet: 'Local models can use MCP web search through orchestration.',
                page_content: 'A local model host can inject search results into a prompt.',
              },
            ],
          }),
        },
      ],
    }));

    const bridge = await resolveMcpResearchBridge({
      research: { enabled: true, query: 'local llm mcp web search', maxSources: 3 },
      message: 'ignored when query provided',
      servers: [
        {
          id: 'kindly-web-search',
          templateId: 'kindly-web-search',
          transport: 'stdio',
          enabled: true,
          command: 'uvx',
        },
      ],
      callTool,
      now: () => 1_700_000_000_000,
    });

    expect(callTool).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'kindly-web-search' }),
      'web_search',
      {
        query: 'local llm mcp web search',
        num_results: 3,
        return_full_pages: true,
      },
      expect.any(Object),
    );
    expect(bridge?.findings.sources).toHaveLength(1);

    const prompt = renderMcpResearchBridgePrompt(bridge!.findings);
    expect(prompt).toContain('## Web Research Evidence');
    expect(prompt).toContain('external untrusted evidence');
    expect(prompt).toContain('[1] Local LLM MCP search');
    expect(prompt).toContain('https://example.test/local-llm-mcp');
  });

  it('returns null when research is disabled or no web-search MCP server is configured', async () => {
    await expect(
      resolveMcpResearchBridge({
        research: { enabled: false },
        message: 'latest CSS docs',
        servers: [],
      }),
    ).resolves.toBeNull();

    await expect(
      resolveMcpResearchBridge({
        research: { enabled: true },
        message: 'latest CSS docs',
        servers: [
          {
            id: 'github',
            transport: 'stdio',
            enabled: true,
            command: 'npx',
          },
        ],
      }),
    ).resolves.toBeNull();
  });
});
