import { useEffect, useState } from 'react';
import type { ProjectSource } from '@open-design/contracts';
import {
  indexProjectSources,
  listProjectSources,
  previewProjectSourceRetrieval,
} from '../state/project-sources';

export function DesignSourcesPanel({ projectId }: { projectId: string }) {
  const enabledKey = `open-design.projectSources.${projectId}.enabled`;
  const [sources, setSources] = useState<ProjectSource[]>([]);
  const [status, setStatus] = useState('Loading sources...');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [context, setContext] = useState('');
  const [enabled, setEnabled] = useState(() => {
    try {
      return window.localStorage.getItem(enabledKey) !== 'false';
    } catch {
      return true;
    }
  });
  const [loadedEnabledKey, setLoadedEnabledKey] = useState(enabledKey);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setError('');
        const body = await listProjectSources(projectId);
        if (cancelled) return;
        setSources(body.sources);
        setStatus(body.sources.length ? `${body.sources.length} design source(s)` : 'No indexed sources yet');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load design sources');
        setStatus('');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    try {
      setEnabled(window.localStorage.getItem(enabledKey) !== 'false');
    } catch {
      setEnabled(true);
    }
    setLoadedEnabledKey(enabledKey);
  }, [enabledKey]);

  useEffect(() => {
    if (loadedEnabledKey !== enabledKey) return;
    try {
      window.localStorage.setItem(enabledKey, enabled ? 'true' : 'false');
    } catch {
      // Source injection still works with the in-memory state if storage is unavailable.
    }
  }, [enabled, enabledKey, loadedEnabledKey]);

  async function handleIndex() {
    try {
      setError('');
      setStatus('Indexing project files...');
      const body = await indexProjectSources(projectId);
      setSources(body.sources);
      setStatus(`Indexed ${body.sources.length} source(s)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to index design sources');
      setStatus('');
    }
  }

  async function handlePreview() {
    try {
      setError('');
      const body = await previewProjectSourceRetrieval(projectId, query);
      setContext(body.context || '(no indexed source context)');
      setStatus(`Previewing ${body.chunks.length} source chunk(s)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview design sources');
    }
  }

  return (
    <section className="df-section design-sources-panel" aria-label="Design Sources">
      <div className="df-section-label">
        Design Sources
        <span className="df-section-count">{sources.length}</span>
      </div>
      <div className="df-controls-row">
        <label className="field-row">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          <span>Use in prompts</span>
        </label>
        <button type="button" className="df-action" onClick={() => void handleIndex()}>
          Index sources
        </button>
        <label className="field" style={{ minWidth: 220 }}>
          <span className="sr-only">Source query</span>
          <input
            value={query}
            placeholder="Retrieval query"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button type="button" className="df-action" onClick={() => void handlePreview()}>
          Preview context
        </button>
      </div>
      {status ? <p role="status" className="hint">{status}</p> : null}
      {error ? <p role="alert" className="field-error">{error}</p> : null}
      {sources.length > 0 ? (
        <div className="settings-card-list">
          {sources.slice(0, 6).map((source) => (
            <div key={source.id} className="agent-model-row">
              <div className="agent-model-row-head">
                <div>
                  <h4>{source.name}</h4>
                  <p className="hint">{source.status} - {source.kind} - {source.chunkCount} chunk(s)</p>
                  <p className="hint">{source.summary}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {context ? (
        <pre className="field-hint" style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto' }}>
          {context}
        </pre>
      ) : null}
    </section>
  );
}
