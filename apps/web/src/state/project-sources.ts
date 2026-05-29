import type {
  ProjectSourcesIndexResponse,
  ProjectSourcesListResponse,
  ProjectSourcesRetrievalPreviewResponse,
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
      ? (body as { error?: { message?: unknown } }).error
      : null;
    throw new Error(typeof error?.message === 'string' ? error.message : fallback);
  }
  return body as T;
}

export async function listProjectSources(projectId: string): Promise<ProjectSourcesListResponse> {
  return readJson<ProjectSourcesListResponse>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/sources`),
    'Failed to list design sources',
  );
}

export async function indexProjectSources(projectId: string): Promise<ProjectSourcesIndexResponse> {
  return readJson<ProjectSourcesIndexResponse>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/sources/index`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }),
    'Failed to index design sources',
  );
}

export async function previewProjectSourceRetrieval(
  projectId: string,
  query = '',
): Promise<ProjectSourcesRetrievalPreviewResponse> {
  const params = new URLSearchParams();
  if (query.trim()) params.set('query', query.trim());
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return readJson<ProjectSourcesRetrievalPreviewResponse>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/sources/retrieval-preview${suffix}`),
    'Failed to preview design source retrieval',
  );
}
