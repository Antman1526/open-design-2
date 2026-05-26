import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LocalModelRecord, LocalModelScorecard } from '@open-design/contracts';

import {
  listLocalModelScorecards,
  listLocalModels,
  scanLocalModels,
  setLocalModelEnabled,
} from '../state/local-models';

const DEFAULT_ROOT = '/Users/Antman/Desktop/AI_Models';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let unit = units[0]!;
  for (let i = 1; i < units.length && size >= 1024; i += 1) {
    size /= 1024;
    unit = units[i]!;
  }
  return `${size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${unit}`;
}

function bestScoreForModel(
  scorecards: LocalModelScorecard[],
  modelId: string,
): LocalModelScorecard | null {
  return scorecards
    .filter((scorecard) => scorecard.modelId === modelId)
    .sort((a, b) => b.overallSuccess - a.overallSuccess)[0] ?? null;
}

export function LocalModelsSection() {
  const [root, setRoot] = useState(DEFAULT_ROOT);
  const [models, setModels] = useState<LocalModelRecord[]>([]);
  const [scorecards, setScorecards] = useState<LocalModelScorecard[]>([]);
  const [status, setStatus] = useState('Loading local models...');
  const [error, setError] = useState('');

  const refreshScorecards = useCallback(async () => {
    const body = await listLocalModelScorecards();
    setScorecards(body.scorecards);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setError('');
        const [nextModels, nextScorecards] = await Promise.all([
          listLocalModels(),
          listLocalModelScorecards(),
        ]);
        if (cancelled) return;
        setModels(nextModels);
        setScorecards(nextScorecards.scorecards);
        setStatus(nextModels.length ? `${nextModels.length} local models` : 'No local models found');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load local models');
        setStatus('');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const scorecardByModel = useMemo(() => {
    const next = new Map<string, LocalModelScorecard | null>();
    for (const model of models) {
      next.set(model.id, bestScoreForModel(scorecards, model.id));
    }
    return next;
  }, [models, scorecards]);

  async function handleScan() {
    try {
      setError('');
      setStatus('Scanning local models...');
      const result = await scanLocalModels(root);
      setModels(result.models);
      await refreshScorecards();
      setStatus(`Found ${result.models.length} models`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan local models');
      setStatus('');
    }
  }

  async function handleToggle(model: LocalModelRecord) {
    try {
      setError('');
      const updated = await setLocalModelEnabled(model.id, !model.enabled);
      setModels((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setStatus(`${updated.name} ${updated.enabled ? 'enabled' : 'disabled'}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update local model');
    }
  }

  return (
    <section className="settings-section settings-section-card local-models-section">
      <div className="memory-field-block">
        <label className="field">
          <span className="field-label">Model folder</span>
          <div className="field-row">
            <input
              value={root}
              onChange={(event) => setRoot(event.target.value)}
            />
            <button type="button" className="btn-secondary" onClick={handleScan}>
              Scan
            </button>
          </div>
        </label>
        {status ? <p role="status" className="hint">{status}</p> : null}
        {error ? <p role="alert" className="field-error">{error}</p> : null}
      </div>

      <div className="settings-card-list">
        {models.map((model) => {
          const bestScore = scorecardByModel.get(model.id);
          return (
            <div key={model.id} className="agent-model-row local-model-row">
              <div className="agent-model-row-head">
                <div>
                  <h4>{model.name}</h4>
                  <p className="hint">
                    {model.roles.join(', ') || 'No roles'} - {formatSize(model.sizeBytes)}
                  </p>
                  <p className="hint">
                    {bestScore
                      ? `Best score ${Math.round(bestScore.overallSuccess * 100)}% (${bestScore.task})`
                      : 'No score'}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  aria-label={`${model.enabled ? 'Disable' : 'Enable'} ${model.name}`}
                  onClick={() => void handleToggle(model)}
                >
                  {model.enabled ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
