import type { LocalModelRecord } from '@open-design/contracts';
import type { AgentInfo, AgentModelOption, AppConfig } from '../types';

const LOCAL_MODEL_PREFIXES = ['lm_', 'local:', 'custom:ai/'];

export function isLocalModelId(modelId: string | null | undefined): boolean {
  const id = modelId?.trim();
  if (!id) return false;
  return LOCAL_MODEL_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export function localModelOptionsForAgent(agent: AgentInfo | null | undefined): AgentModelOption[] {
  return (agent?.models ?? []).filter((model) => isLocalModelId(model.id));
}

export function localModelOptionsFromRecords(
  models: LocalModelRecord[],
): AgentModelOption[] {
  return models
    .filter((model) => model.enabled && model.available)
    .filter((model) => !model.roles.every((role) => role === 'embedding'))
    .map((model) => ({
      id: model.id,
      label: `Local · ${model.name}`,
    }));
}

export function mergeLocalModelOptions(
  primary: AgentModelOption[],
  fallback: AgentModelOption[],
): AgentModelOption[] {
  const seen = new Set<string>();
  const merged: AgentModelOption[] = [];
  for (const option of [...primary, ...fallback]) {
    if (seen.has(option.id)) continue;
    seen.add(option.id);
    merged.push(option);
  }
  return merged;
}

export function activeLocalModelSelection(
  agents: AgentInfo[],
  config: Pick<AppConfig, 'mode' | 'agentId' | 'agentModels'>,
): { agentId: string; modelId: string } | null {
  if (config.mode !== 'daemon' || !config.agentId) return null;
  const agent = agents.find((candidate) => candidate.id === config.agentId && candidate.available);
  if (!agent) return null;
  const modelId = config.agentModels?.[agent.id]?.model ?? null;
  if (typeof modelId !== 'string' || !isLocalModelId(modelId)) return null;
  return { agentId: agent.id, modelId };
}

export function preferredLocalModelSelection(
  agents: AgentInfo[],
  currentAgentId?: string | null,
  fallbackModelOptions: AgentModelOption[] = [],
): { agentId: string; modelId: string } | null {
  const available = agents.filter((agent) => agent.available);
  const current = available.find((agent) => agent.id === currentAgentId);
  const preferred = [
    available.find((agent) => agent.id === 'hermes'),
    current,
    ...available,
  ].filter((agent): agent is AgentInfo => Boolean(agent));

  const seen = new Set<string>();
  for (const agent of preferred) {
    if (seen.has(agent.id)) continue;
    seen.add(agent.id);
    const model = localModelOptionsForAgent(agent)[0];
    if (model) return { agentId: agent.id, modelId: model.id };
  }

  const fallbackModel = fallbackModelOptions[0];
  const fallbackAgent =
    available.find((agent) => agent.id === 'hermes') ??
    current ??
    available[0] ??
    null;
  if (fallbackAgent && fallbackModel) {
    return { agentId: fallbackAgent.id, modelId: fallbackModel.id };
  }

  return null;
}

export function localModelDisplayLabel(label: string): string {
  return label.replace(/^Local\s*·\s*/i, '');
}
