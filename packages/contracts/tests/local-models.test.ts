import { describe, expect, it } from 'vitest';
import {
  computeLocalModelOverallSuccess,
  inferLocalModelRoles,
  LocalModelDiagnosticsResponseSchema,
  LocalModelRecordSchema,
  LocalModelTestResponseSchema,
  LocalModelScorecardSchema,
} from '../src/api/local-models';
import { ProjectSourceSchema, ProjectSourceChunkSchema } from '../src/api/project-sources';

describe('local model contracts', () => {
  it('accepts a discovered GGUF model record', () => {
    const parsed = LocalModelRecordSchema.parse({
      id: 'lm_qwen3_coder_30b_a3b_instruct_q4_k_m_12345678',
      name: 'Qwen3-Coder-30B-A3B-Instruct-Q4_K_M',
      fileName: 'Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf',
      path: '/Users/Antman/Desktop/AI_Models/GGUF/Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf',
      sizeBytes: 123,
      mtimeMs: 456,
      digest: '1234567890abcdef',
      roles: ['code', 'repair'],
      enabled: true,
      discoveredAt: 1779757200000,
      updatedAt: 1779757200000,
    });

    expect(parsed.roles).toEqual(['code', 'repair']);
  });

  it('computes the weighted overall success score', () => {
    expect(
      computeLocalModelOverallSuccess({
        completionSuccess: 0.8,
        designSuccess: 0.6,
        userSuccess: 0.5,
        performanceScore: 0.9,
      }),
    ).toBeCloseTo(0.68, 5);
  });

  it('rejects invalid score inputs before computing', () => {
    expect(() =>
      computeLocalModelOverallSuccess({
        completionSuccess: 1.2,
        designSuccess: 0.6,
        userSuccess: 0.5,
        performanceScore: 0.9,
      }),
    ).toThrow();
  });

  it('infers useful role hints from filenames', () => {
    expect(inferLocalModelRoles('nomic-embed-text-v1.5.f16.gguf')).toEqual(['embedding']);
    expect(inferLocalModelRoles('Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf')).toEqual([
      'code',
      'repair',
    ]);
    expect(inferLocalModelRoles('Llama-3.2-1B-Instruct-Q4_K_M.gguf')).toEqual([
      'summary',
      'fallback',
    ]);
    expect(inferLocalModelRoles('SmolLM2-1.7B-Instruct-Q4_K_M.gguf')).toEqual([
      'summary',
      'fallback',
    ]);
    expect(inferLocalModelRoles('Phi-3.5-mini-instruct-Q4_K_M.gguf')).toEqual([
      'summary',
      'fallback',
    ]);
    expect(inferLocalModelRoles('Qwen-11B-Instruct.gguf')).toEqual(['design']);
  });

  it('accepts scorecards with task-specific metrics', () => {
    const parsed = LocalModelScorecardSchema.parse({
      modelId: 'lm_test',
      task: 'code',
      attempts: 4,
      completionSuccess: 0.75,
      designSuccess: 0.5,
      userSuccess: 0.25,
      performanceScore: 0.9,
      overallSuccess: 0.6275,
      medianLatencyMs: 1200,
      timeoutRate: 0.25,
      crashRate: 0,
      updatedAt: 1779757200000,
    });

    expect(parsed.task).toBe('code');
  });

  it('accepts local model test responses', () => {
    const parsed = LocalModelTestResponseSchema.parse({
      ok: true,
      modelId: 'lm_test',
      task: 'design',
      serverMode: 'llama-server',
      latencyMs: 1200,
      sample: 'ready',
      scorecard: {
        modelId: 'lm_test',
        task: 'design',
        attempts: 1,
        completionSuccess: 1,
        designSuccess: 1,
        userSuccess: 0,
        performanceScore: 0.99,
        overallSuccess: 0.649,
        medianLatencyMs: 1200,
        timeoutRate: 0,
        crashRate: 0,
        updatedAt: 1779757200000,
      },
    });

    expect(parsed.serverMode).toBe('llama-server');
  });

  it('accepts local model diagnostics responses', () => {
    const parsed = LocalModelDiagnosticsResponseSchema.parse({
      root: {
        path: '/Users/Antman/Desktop/AI_Models',
        exists: true,
        readable: true,
        message: 'root is readable',
      },
      gguf: {
        path: '/Users/Antman/Desktop/AI_Models/GGUF',
        exists: true,
        readable: true,
        message: 'GGUF folder is readable',
      },
      llamaServer: {
        command: 'llama-server',
        available: false,
        message: 'llama-server was not found',
      },
      modelCount: 18,
      checkedAt: 1779757200000,
    });

    expect(parsed.modelCount).toBe(18);
  });

  it('accepts project source and chunk records', () => {
    const source = ProjectSourceSchema.parse({
      id: 'src_test',
      projectId: 'project',
      path: 'brief.md',
      name: 'brief.md',
      kind: 'text',
      mime: 'text/markdown',
      sizeBytes: 42,
      status: 'indexed',
      summary: '1 indexed chunk(s)',
      chunkCount: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    const chunk = ProjectSourceChunkSchema.parse({
      id: 'chunk',
      sourceId: source.id,
      projectId: source.projectId,
      path: source.path,
      chunkIndex: 0,
      kind: 'text',
      text: 'brand brief',
      charCount: 11,
      createdAt: 1,
    });

    expect(chunk.sourceId).toBe(source.id);
  });
});
