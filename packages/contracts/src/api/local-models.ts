import { z } from 'zod';

export const LocalModelRoleSchema = z.enum([
  'embedding',
  'summary',
  'design',
  'code',
  'repair',
  'fallback',
]);

export type LocalModelRole = z.infer<typeof LocalModelRoleSchema>;

export const LocalModelTaskSchema = z.enum([
  'embedding',
  'summary',
  'design',
  'code',
  'repair',
  'critique',
  'fallback',
]);

export type LocalModelTask = z.infer<typeof LocalModelTaskSchema>;

export const LocalModelRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fileName: z.string().min(1),
  path: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  mtimeMs: z.number().nonnegative(),
  digest: z.string().min(8),
  roles: z.array(LocalModelRoleSchema),
  enabled: z.boolean(),
  discoveredAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type LocalModelRecord = z.infer<typeof LocalModelRecordSchema>;

export const LocalModelScoreInputSchema = z.object({
  completionSuccess: z.number().min(0).max(1),
  designSuccess: z.number().min(0).max(1),
  userSuccess: z.number().min(0).max(1),
  performanceScore: z.number().min(0).max(1),
});

export type LocalModelScoreInput = z.infer<typeof LocalModelScoreInputSchema>;

export const LocalModelScorecardSchema = LocalModelScoreInputSchema.extend({
  modelId: z.string().min(1),
  task: LocalModelTaskSchema,
  attempts: z.number().int().nonnegative(),
  overallSuccess: z.number().min(0).max(1),
  medianLatencyMs: z.number().int().nonnegative().nullable(),
  timeoutRate: z.number().min(0).max(1),
  crashRate: z.number().min(0).max(1),
  updatedAt: z.number().int().nonnegative(),
});

export type LocalModelScorecard = z.infer<typeof LocalModelScorecardSchema>;

export interface LocalModelScanRequest {
  root?: string;
}

export interface LocalModelScanResponse {
  root: string;
  models: LocalModelRecord[];
  scannedAt: number;
}

export interface LocalModelListResponse {
  models: LocalModelRecord[];
}

export interface LocalModelScorecardsResponse {
  scorecards: LocalModelScorecard[];
}

export const LocalModelDiagnosticsRequestSchema = z.object({
  root: z.string().optional(),
  llamaServerBin: z.string().optional(),
});

export type LocalModelDiagnosticsRequest = z.infer<typeof LocalModelDiagnosticsRequestSchema>;

export const LocalModelPathCheckSchema = z.object({
  path: z.string(),
  exists: z.boolean(),
  readable: z.boolean(),
  message: z.string(),
});

export const LocalModelBinaryCheckSchema = z.object({
  command: z.string(),
  available: z.boolean(),
  resolvedPath: z.string().optional(),
  message: z.string(),
});

export const LocalModelDiagnosticsResponseSchema = z.object({
  root: LocalModelPathCheckSchema,
  gguf: LocalModelPathCheckSchema,
  llamaServer: LocalModelBinaryCheckSchema,
  modelCount: z.number().int().nonnegative(),
  checkedAt: z.number().int().nonnegative(),
});

export type LocalModelDiagnosticsResponse = z.infer<typeof LocalModelDiagnosticsResponseSchema>;

export interface LocalModelPatchRequest {
  enabled?: boolean;
}

export interface LocalModelPatchResponse {
  model: LocalModelRecord;
}

export const LocalModelServerModeSchema = z.enum([
  'openai-compatible',
  'ollama',
  'llama-server',
  'unavailable',
]);

export type LocalModelServerMode = z.infer<typeof LocalModelServerModeSchema>;

export const LocalModelTestRequestSchema = z.object({
  task: LocalModelTaskSchema.optional(),
  prompt: z.string().optional(),
  timeoutMs: z.number().int().positive().max(600_000).optional(),
  llamaServerBin: z.string().optional(),
});

export type LocalModelTestRequest = z.infer<typeof LocalModelTestRequestSchema>;

export const LocalModelTestResponseSchema = z.object({
  ok: z.boolean(),
  modelId: z.string().min(1),
  task: LocalModelTaskSchema,
  serverMode: LocalModelServerModeSchema,
  latencyMs: z.number().int().nonnegative(),
  sample: z.string(),
  error: z.string().optional(),
  scorecard: LocalModelScorecardSchema,
});

export type LocalModelTestResponse = z.infer<typeof LocalModelTestResponseSchema>;

export const LocalModelRouteResponseSchema = z.object({
  model: LocalModelRecordSchema.nullable(),
  scorecard: LocalModelScorecardSchema.nullable(),
  task: LocalModelTaskSchema,
  reason: z.string(),
});

export type LocalModelRouteResponse = z.infer<typeof LocalModelRouteResponseSchema>;

export function computeLocalModelOverallSuccess(input: LocalModelScoreInput): number {
  const parsed = LocalModelScoreInputSchema.parse(input);
  const score =
    parsed.completionSuccess * 0.35 +
    parsed.designSuccess * 0.35 +
    parsed.userSuccess * 0.2 +
    parsed.performanceScore * 0.1;

  return Math.round(score * 10000) / 10000;
}

function hasModelSizeToken(normalized: string, tokens: string[]): boolean {
  return tokens.some((token) => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(normalized);
  });
}

export function inferLocalModelRoles(fileName: string): LocalModelRole[] {
  const normalized = fileName.toLowerCase();

  if (normalized.includes('embed')) {
    return ['embedding'];
  }

  if (normalized.includes('coder') || normalized.includes('code')) {
    return ['code', 'repair'];
  }

  if (
    normalized.includes('deepseek') ||
    normalized.includes('r1') ||
    normalized.includes('reason')
  ) {
    return ['repair', 'design'];
  }

  if (
    hasModelSizeToken(normalized, ['1b', '1.7b']) ||
    normalized.includes('mini')
  ) {
    return ['summary', 'fallback'];
  }

  if (
    normalized.includes('mistral') ||
    normalized.includes('hermes') ||
    normalized.includes('qwen')
  ) {
    return ['design'];
  }

  return ['design'];
}
