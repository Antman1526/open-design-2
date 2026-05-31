// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InlineModelSwitcher } from '../../src/components/InlineModelSwitcher';
import { I18nProvider } from '../../src/i18n';
import type { AgentInfo, AppConfig } from '../../src/types';

const config: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  agentId: 'opencode',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: { opencode: { model: 'default' } },
  agentCliEnv: {},
};

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
    ],
  },
];

afterEach(() => cleanup());

describe('InlineModelSwitcher local models mode', () => {
  it('exposes Local Models as a first-class mode and selects the Hermes local model runner', () => {
    const onLocalModelChange = vi.fn();
    render(
      <I18nProvider initial="en">
        <InlineModelSwitcher
          config={config}
          agents={agents}
          daemonLive
          onModeChange={vi.fn()}
          onAgentChange={vi.fn()}
          onAgentModelChange={vi.fn()}
          onLocalModelChange={onLocalModelChange}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-mode-local'));

    expect(onLocalModelChange).toHaveBeenCalledWith('hermes', 'lm_qwen_abc123');
  });

  it('opens Local Models settings instead of disabling the mode when no model is attached to agents', () => {
    const onOpenSettings = vi.fn();
    render(
      <I18nProvider initial="en">
        <InlineModelSwitcher
          config={config}
          agents={[
            {
              id: 'hermes',
              name: 'Hermes',
              bin: 'hermes',
              available: true,
              models: [{ id: 'default', label: 'Default (CLI config)' }],
            },
          ]}
          daemonLive
          onModeChange={vi.fn()}
          onAgentChange={vi.fn()}
          onAgentModelChange={vi.fn()}
          onLocalModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onOpenSettings={onOpenSettings}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    const localMode = screen.getByTestId('inline-model-switcher-mode-local');

    expect((localMode as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(localMode);
    expect(onOpenSettings).toHaveBeenCalledWith('local-models');
  });
});
