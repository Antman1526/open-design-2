import { useEffect, useRef, useState } from 'react';
import type { ProjectSource } from '@open-design/contracts';
import {
  indexProjectSources,
  listProjectSources,
  previewProjectSourceRetrieval,
} from '../state/project-sources';

export function DesignSourcesPanel({
  projectId,
  onUploadFiles,
}: {
  projectId: string;
  onUploadFiles?: (files: File[]) => void;
}) {
  const enabledKey = `open-design.projectSources.${projectId}.enabled`;
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
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
  const [showAll, setShowAll] = useState(false);

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

  function handleUploadChange(files: FileList | null) {
    const selected = Array.from(files ?? []);
    if (selected.length === 0) return;
    onUploadFiles?.(selected);
    setStatus(`${selected.length} file(s) queued for upload. Index sources after upload completes.`);
    if (uploadInputRef.current) uploadInputRef.current.value = '';
  }

  const visibleSources = showAll ? sources : sources.slice(0, 6);

  return (
    <section className="df-section design-sources-panel" aria-label="Design Sources">
      <div className="df-section-label">
        Design Sources
        <span className="df-section-count">{sources.length}</span>
      </div>
      <div className="df-controls-row design-sources-controls">
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
        {onUploadFiles ? (
          <>
            <input
              ref={uploadInputRef}
              aria-label="Upload design sources"
              type="file"
              multiple
              className="sr-only"
              onChange={(event) => handleUploadChange(event.target.files)}
            />
            <button
              type="button"
              className="df-action"
              onClick={() => uploadInputRef.current?.click()}
            >
              Upload sources
            </button>
          </>
        ) : null}
        <label className="field design-sources-query">
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
          {visibleSources.map((source) => (
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
          {sources.length > 6 ? (
            <button
              type="button"
              className="df-action"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? 'Show fewer sources' : `Show all ${sources.length} sources`}
            </button>
          ) : null}
        </div>
      ) : null}
      {context ? (
        <pre className="field-hint design-sources-context">
          {context}
        </pre>
      ) : null}
    </section>
  );
}
