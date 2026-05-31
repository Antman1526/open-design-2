import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LocalModelRecord, LocalModelScorecard } from '@open-design/contracts';

import {
  diagnoseLocalModels,
  getLocalModelScanStatus,
  listLocalModelScorecards,
  listLocalModels,
  scanLocalModels,
  setLocalModelEnabled,
  testLocalModel,
} from '../state/local-models';

const DEFAULT_ROOT = '/Users/Antman/Desktop/AI_Models';
const MODEL_ROOT_PRESETS = [
  '/Users/Antman/Desktop/AI_Models',
  '/Volumes/MainStore/Development/AI_Models',
];
const ROOT_STORAGE_KEY = 'open-design.localModelRoot';
const LLAMA_SERVER_BIN_STORAGE_KEY = 'open-design.llamaServerBin';
const TEST_TASKS = ['design', 'code', 'summary', 'critique', 'repair', 'embedding'] as const;
const STARTUP_SCAN_POLL_MS = 250;

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

function formatStartupScanStatus(root: string | null): string {
  return `Startup scan running${root ? ` for ${root}` : ''}...`;
}

function formatStartupScanComplete(scannedCount: number, modelCount: number): string {
  const scannedLabel = scannedCount === 1 ? 'model' : 'models';
  const trackedLabel = modelCount === 1 ? 'local model' : 'local models';
  return `Startup scan found ${scannedCount} ${scannedLabel}; ${modelCount} ${trackedLabel} tracked`;
}

export function LocalModelsSection() {
  const [root, setRoot] = useState(() => {
    try {
      return window.localStorage.getItem(ROOT_STORAGE_KEY) || DEFAULT_ROOT;
    } catch {
      return DEFAULT_ROOT;
    }
  });
  const [llamaServerBin, setLlamaServerBin] = useState(() => {
    try {
      return window.localStorage.getItem(LLAMA_SERVER_BIN_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [models, setModels] = useState<LocalModelRecord[]>([]);
  const [scorecards, setScorecards] = useState<LocalModelScorecard[]>([]);
  const [status, setStatus] = useState('Loading local models...');
  const [error, setError] = useState('');
  const [testingId, setTestingId] = useState('');
  const [testTask, setTestTask] = useState<(typeof TEST_TASKS)[number]>('design');
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [diagnostics, setDiagnostics] = useState<string[]>([]);

  const refreshScorecards = useCallback(async () => {
    const body = await listLocalModelScorecards();
    setScorecards(body.scorecards);
  }, []);

  const loadModelsAndScorecards = useCallback(async () => {
    const [nextModels, nextScorecards] = await Promise.all([
      listLocalModels(),
      listLocalModelScorecards(),
    ]);
    return { nextModels, nextScorecards };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleStartupScanPoll() {
      pollTimer = setTimeout(() => {
        void pollStartupScan();
      }, STARTUP_SCAN_POLL_MS);
    }

    async function pollStartupScan() {
      try {
        const scanStatus = await getLocalModelScanStatus();
        if (cancelled) return;
        if (scanStatus.status === 'running') {
          setStatus(formatStartupScanStatus(scanStatus.root));
          scheduleStartupScanPoll();
          return;
        }
        const { nextModels, nextScorecards } = await loadModelsAndScorecards();
        if (cancelled) return;
        setModels(nextModels);
        setScorecards(nextScorecards.scorecards);
        if (scanStatus.status === 'completed') {
          setStatus(formatStartupScanComplete(scanStatus.scannedCount, scanStatus.modelCount));
        } else if (scanStatus.status === 'failed') {
          setStatus(scanStatus.error ? `Startup scan failed: ${scanStatus.error}` : 'Startup scan failed');
        } else {
          setStatus(nextModels.length ? `${nextModels.length} local models` : 'No local models found');
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load local model scan status');
        setStatus('');
      }
    }

    async function load() {
      try {
        setError('');
        const [{ nextModels, nextScorecards }, scanStatus] = await Promise.all([
          loadModelsAndScorecards(),
          getLocalModelScanStatus(),
        ]);
        if (cancelled) return;
        setModels(nextModels);
        setScorecards(nextScorecards.scorecards);
        if (scanStatus.status === 'running') {
          setStatus(formatStartupScanStatus(scanStatus.root));
          scheduleStartupScanPoll();
        } else if (scanStatus.status === 'completed') {
          setStatus(formatStartupScanComplete(scanStatus.scannedCount, scanStatus.modelCount));
        } else if (scanStatus.status === 'failed') {
          setStatus(scanStatus.error ? `Startup scan failed: ${scanStatus.error}` : 'Startup scan failed');
        } else {
          setStatus(nextModels.length ? `${nextModels.length} local models` : 'No local models found');
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load local models');
        setStatus('');
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
    };
  }, [loadModelsAndScorecards]);

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
      try {
        window.localStorage.setItem(ROOT_STORAGE_KEY, root);
        window.localStorage.setItem(LLAMA_SERVER_BIN_STORAGE_KEY, llamaServerBin);
      } catch {
        // Ignore storage failures; the daemon still scans the supplied path.
      }
      const result = await scanLocalModels(root);
      setModels(result.models);
      await refreshScorecards();
      setStatus(`Found ${result.models.length} models`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan local models');
      setStatus('');
    }
  }

  async function handleDiagnostics() {
    try {
      setError('');
      setStatus('Checking local model setup...');
      const result = await diagnoseLocalModels(root, llamaServerBin);
      setDiagnostics([
        result.root.message,
        result.gguf.message,
        `${result.modelCount} GGUF model file(s) found`,
        result.llamaServer.message,
      ]);
      setStatus(result.llamaServer.available ? 'Local model setup looks usable' : 'Local model setup needs attention');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to diagnose local models');
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

  async function handleTest(model: LocalModelRecord) {
    try {
      setError('');
      setTestingId(model.id);
      setStatus(`Testing ${model.name}...`);
      const result = await testLocalModel(
        model.id,
        testTask,
        llamaServerBin,
      );
      setTestResults((current) => ({
        ...current,
        [model.id]: `${result.ok ? 'Passed' : 'Failed'} via ${result.serverMode} in ${result.latencyMs}ms`,
      }));
      await refreshScorecards();
      setStatus(`${model.name} ${result.ok ? 'passed' : 'failed'} test`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to test local model');
    } finally {
      setTestingId('');
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
        <div className="field-hint local-model-root-presets">
          {MODEL_ROOT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="btn-secondary"
              onClick={() => setRoot(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
        <label className="field">
          <span className="field-label">llama-server binary</span>
          <div className="field-row">
            <input
              value={llamaServerBin}
              placeholder="llama-server or /path/to/llama-server"
              onChange={(event) => setLlamaServerBin(event.target.value)}
            />
            <button type="button" className="btn-secondary" onClick={() => void handleDiagnostics()}>
              Check
            </button>
          </div>
        </label>
        <label className="field">
          <span className="field-label">Test task</span>
          <select
            aria-label="Test task"
            value={testTask}
            onChange={(event) => setTestTask(event.target.value as (typeof TEST_TASKS)[number])}
          >
            {TEST_TASKS.map((task) => (
              <option key={task} value={task}>{task}</option>
            ))}
          </select>
        </label>
        {status ? <p role="status" className="hint">{status}</p> : null}
        {error ? <p role="alert" className="field-error">{error}</p> : null}
        {diagnostics.length > 0 ? (
          <ul className="field-hint">
            {diagnostics.map((item) => <li key={item}>{item}</li>)}
          </ul>
        ) : null}
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
                    {model.available === false ? ' - missing from disk' : ''}
                  </p>
                  <p className="hint">
                    {bestScore
                      ? `Best score ${Math.round(bestScore.overallSuccess * 100)}% (${bestScore.task})`
                      : 'No score'}
                  </p>
                  {testResults[model.id] ? (
                    <p className="hint">{testResults[model.id]}</p>
                  ) : null}
                </div>
                <div className="field-row">
                  <button
                    type="button"
                    className="btn-secondary"
                    aria-label={`Test ${model.name}`}
                    disabled={testingId === model.id}
                    onClick={() => void handleTest(model)}
                  >
                    {testingId === model.id ? 'Testing' : 'Test'}
                  </button>
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
            </div>
          );
        })}
      </div>
    </section>
  );
}
