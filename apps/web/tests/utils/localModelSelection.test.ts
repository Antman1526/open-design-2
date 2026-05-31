import { describe, expect, it } from 'vitest';
import type { AgentInfo } from '../../src/types';
import {
  activeLocalModelSelection,
  localModelOptionsForAgent,
  preferredLocalModelSelection,
} from '../../src/utils/localModelSelection';

const agents: AgentInfo[] = [
  {
    id: 'opencode',
    name: 'OpenCode',
    bin: 'opencode',
    available: true,
    models: [
      { id: 'default', label: 'Default (CLI config)' },
      { id: 'lm_qwen_abc123', label: 'Local · Qwen3.6-27B' },
    ],
  },
  {
    id: 'hermes',
    name: 'Hermes',
    bin: 'hermes',
    available: true,
    models: [
      { id: 'default', label: 'Default (CLI config)' },
      { id: 'lm_qwen_abc123', label: 'Local · Qwen3.6-27B' },
      { id: 'lm_mistral_def456', label: 'Local · Mistral-7B · 75% success' },
    ],
  },
];

describe('local model selection helpers', () => {
  it('filters only first-class local model options', () => {
    expect(localModelOptionsForAgent(agents[1]!)).toEqual([
      { id: 'lm_qwen_abc123', label: 'Local · Qwen3.6-27B' },
      { id: 'lm_mistral_def456', label: 'Local · Mistral-7B · 75% success' },
    ]);
  });

  it('prefers Hermes as the local model runner when entering local mode', () => {
    expect(preferredLocalModelSelection(agents, 'opencode')).toEqual({
      agentId: 'hermes',
      modelId: 'lm_qwen_abc123',
    });
  });

  it('keeps the selected wrapper and model when already using a local model', () => {
    expect(
      activeLocalModelSelection(
        agents,
        {
          mode: 'daemon',
          agentId: 'opencode',
          agentModels: { opencode: { model: 'lm_qwen_abc123' } },
        },
      ),
    ).toEqual({
      agentId: 'opencode',
      modelId: 'lm_qwen_abc123',
    });
  });
});
