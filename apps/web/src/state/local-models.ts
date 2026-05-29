import type {
  LocalModelListResponse,
  LocalModelPatchResponse,
  LocalModelRecord,
  LocalModelScanResponse,
  LocalModelScorecardsResponse,
  LocalModelDiagnosticsResponse,
  LocalModelTask,
  LocalModelTestResponse,
} from '@open-design/contracts';

async function readJson<T>(resp: Response, fallback: string): Promise<T> {
  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    body = null;
  }

  if (!resp.ok) {
    const error = body && typeof body === 'object' && 'error' in body
      ? (body as { error?: unknown }).error
      : null;
    const message = typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? (error as { message?: unknown }).message
        : null;
    throw new Error(typeof message === 'string' && message ? message : fallback);
  }

  return body as T;
}

export async function listLocalModels(): Promise<LocalModelRecord[]> {
  const body = await readJson<LocalModelListResponse>(
    await fetch('/api/local-models'),
    'Failed to list local models',
  );
  return body.models;
}

export async function scanLocalModels(root: string): Promise<LocalModelScanResponse> {
  return readJson<LocalModelScanResponse>(
    await fetch('/api/local-models/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root }),
    }),
    'Failed to scan local models',
  );
}

export async function diagnoseLocalModels(
  root: string,
  llamaServerBin?: string,
): Promise<LocalModelDiagnosticsResponse> {
  return readJson<LocalModelDiagnosticsResponse>(
    await fetch('/api/local-models/diagnostics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        root,
        ...(llamaServerBin?.trim() ? { llamaServerBin: llamaServerBin.trim() } : {}),
      }),
    }),
    'Failed to diagnose local model setup',
  );
}

export async function listLocalModelScorecards(): Promise<LocalModelScorecardsResponse> {
  return readJson<LocalModelScorecardsResponse>(
    await fetch('/api/local-models/scorecards'),
    'Failed to load local model scorecards',
  );
}

export async function setLocalModelEnabled(
  id: string,
  enabled: boolean,
): Promise<LocalModelRecord> {
  const body = await readJson<LocalModelPatchResponse>(
    await fetch(`/api/local-models/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }),
    'Failed to update local model',
  );
  return body.model;
}

export async function testLocalModel(
  id: string,
  task: LocalModelTask = 'design',
  llamaServerBin?: string,
): Promise<LocalModelTestResponse> {
  return readJson<LocalModelTestResponse>(
    await fetch(`/api/local-models/${encodeURIComponent(id)}/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        task,
        ...(llamaServerBin?.trim() ? { llamaServerBin: llamaServerBin.trim() } : {}),
      }),
    }),
    'Failed to test local model',
  );
}
