import { describe, expect, it, vi } from 'vitest';

import {
  renderMcpResearchBridgePrompt,
  resolveMcpResearchBridge,
  selectMcpWebResearchServer,
} from '../src/research/mcp-bridge.js';

describe('MCP research bridge', () => {
  it('selects enabled Kindly stdio servers as web research providers', () => {
    const server = selectMcpWebResearchServer([
      {
        id: 'kindly-web-search',
        label: 'Kindly Web Search',
        templateId: 'kindly-web-search',
        transport: 'stdio',
        enabled: true,
        command: 'uvx',
      },
    ]);

    expect(server?.id).toBe('kindly-web-search');
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
