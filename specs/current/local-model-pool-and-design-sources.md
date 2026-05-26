# Local Model Pool and Design Sources

Date: 2026-05-26

## Purpose

Open Design should let users upload documents, files, and images as design source material, then use local GGUF models stored under `/Users/Antman/Desktop/AI_Models` to create, critique, and repair design artifacts. The app should use every supported model in that folder as part of a measured local model pool, not as a single manual model choice.

This feature extends existing project-scoped upload and attachment behavior instead of creating a separate document system. Uploaded sources stay with the project, are treated as untrusted reference material, and can be retrieved into design prompts when relevant.

## Current Repo Context

- `apps/daemon` owns REST/SSE APIs, project files, run orchestration, local daemon process behavior, and SQLite metadata.
- `apps/web` owns the chat composer, project UI, settings panels, and file/source interactions.
- `packages/contracts` carries shared request/response DTOs and event types.
- Existing project uploads land through `/api/projects/:id/upload`.
- Existing attachment context code in `apps/web/src/api-attachment-context.ts` can inline text, code, HTML, PDF/document/presentation/spreadsheet previews into API-mode prompts with an explicit untrusted-material boundary.
- Existing provider proxy code supports OpenAI-compatible streaming and Ollama Cloud style providers, which gives the local model work a natural integration point.
- Existing Critique Theater/conformance machinery can provide design-quality signals for success-rate scoring.

## Local Model Inventory

The initial local model root is:

```text
/Users/Antman/Desktop/AI_Models
```

Detected model files include the `.gguf` models under:

```text
/Users/Antman/Desktop/AI_Models/GGUF
```

Important entries include:

- `nomic-embed-text-v1.5.f16.gguf`
- `Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf`
- `Qwen3-Coder-30B-A3B-Instruct-Q8_0.gguf`
- `Qwen2.5-14B-Instruct-Q4_K_M.gguf`
- `Qwen3.5-9B-Q4_K_M.gguf`
- `DeepSeek-R1-Distill-Qwen-14B-Q4_K_M.gguf`
- `Llama-3.2-3B-Instruct-Q4_K_M.gguf`
- `Llama-3.2-1B-Instruct-Q4_K_M.gguf`
- `SmolLM2-1.7B-Instruct-Q4_K_M.gguf`
- `Mistral-7B-Instruct-v0.3-Q4_K_M.gguf`
- `Hermes-3-Llama-3.1-8B-Q4_K_M.gguf`
- `Phi-3.5-mini-instruct-Q4_K_M.gguf`

The scanner should ignore support directories such as `llama.cpp`, `llama-cache`, `ollama`, `servers`, `cache`, and `logs` as model entries.

## Recommended Approach

Use a hybrid local model pool:

1. Scan `/Users/Antman/Desktop/AI_Models/GGUF` for all `.gguf` files.
2. Register each model as an eligible local model with derived metadata.
3. Prefer an already-running OpenAI-compatible local server when available.
4. Otherwise launch a llama.cpp-compatible server process for the selected model.
5. Route work across models based on task type, observed success rate, current availability, and performance.
6. Store model scorecards locally in SQLite so routing improves over time.

This avoids forcing the user to manually choose a model every run, while preserving manual override for debugging or preference.

## User Experience

### Settings

Add a `Local Models` settings area:

- Model root path: `/Users/Antman/Desktop/AI_Models`
- Scan button
- Model list with discovered model names, paths, size, role guess, availability, and recent success rate
- Server mode: auto, connect only, or launch only
- Defaults for context length, GPU layers, threads, batch size, temperature, and timeout
- Manual enable/disable toggle per model

### Design Sources

Add a clear `Design Sources` surface in project chat:

- Upload documents, files, images, and folders
- Show uploaded source cards with name, type, size, extraction/index status, and whether they are attached to the next run
- Let the user attach all sources, selected sources, or relevant-only sources
- Keep existing chat composer upload behavior, but make source usage explicit and auditable

### Model Scorecards

Expose a model scorecard table:

- Overall success rate
- Completion success
- Design success
- User success
- Median latency
- Timeout rate
- Crash rate
- Last used
- Best task type
- Notes from failure classification

## Data Flow

1. User uploads files to a project.
2. Daemon stores files in the project root using the existing safe upload path.
3. Source indexer extracts text/metadata.
4. Source chunker creates bounded chunks with stable source ids and offsets.
5. Embedding worker uses `nomic-embed-text-v1.5.f16.gguf` when available.
6. Run creation asks the source retriever for relevant chunks.
7. Prompt builder injects retrieved chunks under an untrusted reference-material boundary.
8. Model router picks the best eligible local model for the task.
9. Run events record model id, local path, server mode, timing, completion result, critique result, and user feedback.
10. Scorecard updater rolls the outcome into per-model metrics.

## Model Routing

Initial routing hints:

| Task | Preferred models |
| --- | --- |
| Embeddings | `nomic-embed-text-v1.5.f16.gguf` |
| Fast summarization and drafts | `Llama-3.2-1B`, `SmolLM2-1.7B`, `Phi-3.5-mini` |
| General design generation | `Qwen2.5-14B`, `Qwen3.5-9B`, `Mistral-7B`, `Hermes-3` |
| Code-heavy artifacts | `Qwen3-Coder-30B-A3B-Instruct-Q4_K_M`, `Qwen3-Coder-30B-A3B-Instruct-Q8_0` |
| Reasoning and repair | `DeepSeek-R1-Distill-Qwen-14B`, `Qwen3-Coder-30B-A3B`, `Qwen3.6-27B` |
| Fallback | Highest completion success among small enabled models |

The router should treat these as priors only. Once scorecards have enough data, observed success should override filename-derived guesses.

## Success Rate

Use a combined success definition:

```text
overall_success =
  0.35 * completion_success +
  0.35 * design_success +
  0.20 * user_success +
  0.10 * performance_score
```

Completion success means the model process started or connected, streamed usable output, produced the required artifact format, and avoided timeout/crash.

Design success means artifact validation passed, Critique Theater met the configured threshold when enabled, uploaded source material was used correctly when required, and generated files/assets were not broken.

User success comes from positive feedback, export/share/deploy/use actions, manual success marks, and negative feedback or regenerate requests.

Performance score accounts for latency and reliability without allowing speed alone to beat quality for final artifacts.

## Persistence

Additive persistence should avoid rewriting existing project/run semantics:

- `local_models`: discovered model path, digest, size, inferred family, role hints, enabled state
- `local_model_runs`: per-run model usage, timing, server mode, exit/error status
- `local_model_scorecards`: rolling aggregate metrics per model and task type
- `project_sources`: uploaded/indexed source metadata
- `project_source_chunks`: extracted chunks and optional embedding references

Secrets are not needed for direct local GGUF paths. If a local server endpoint uses an API key, store it through the existing app config/credential pattern and redact it in logs.

## API and CLI Surface

Every capability needs web UI and CLI parity.

HTTP endpoints:

- `GET /api/local-models`
- `POST /api/local-models/scan`
- `POST /api/local-models/:id/test`
- `PATCH /api/local-models/:id`
- `GET /api/local-models/scorecards`
- `POST /api/projects/:id/sources/index`
- `GET /api/projects/:id/sources`
- `GET /api/projects/:id/sources/retrieval-preview`

CLI commands:

```bash
od model scan --root /Users/Antman/Desktop/AI_Models --json
od model list --json
od model test <model-id> --json
od model scorecard [--task design|code|summary|critique] --json
od model enable <model-id>
od model disable <model-id>
od files upload <projectId> <localpath> [--as <relpath>]
od sources index <projectId> [--json]
od sources list <projectId> [--json]
```

## Error Handling

- Missing model root: show a clear settings error and keep cloud/API providers unaffected.
- Unsupported file type: upload succeeds, indexing records `unsupported`, and the prompt uses metadata only.
- Model launch failure: mark the run attempt failed, down-rank that model for the task, and retry with the next eligible model when auto fallback is enabled.
- Model timeout: terminate the local server process if Open Design launched it, record timeout, and retry only once unless the user opts into longer retries.
- Source extraction failure: preserve the original uploaded file, record the extraction error, and continue without that source chunk.
- Prompt-injection attempts in uploaded files: keep the existing untrusted-material boundary and never let uploaded content override system/developer/user instructions.

## Testing

- Contract tests for local model DTOs, scorecard formula, rolling aggregation, and source chunk DTOs.
- Daemon tests for scanning, stable ids, score updates, safe source paths, and retrieval filtering.
- Web tests for settings scan/list, source upload status, scorecard sorting, and manual enable/disable.
- E2E smoke for uploading sources, indexing them, running with the local model pool, and verifying scorecard updates.

## Phases

1. Discovery and scorecards: scan GGUF models, store discovered models, add model list UI/CLI, add scorecard schema.
2. Local model runner: connect to or launch OpenAI-compatible llama.cpp server, test prompts, route tasks, record completion metrics.
3. Design sources: promote uploads into sources, index text and previewable documents, retrieve chunks, inject prompt context.
4. Quality loop: feed Critique Theater, artifact validation, and user feedback into scorecards; rank models by task type; fallback automatically.
5. Rich media sources: add local image captioning/OCR when suitable models exist, improve document extraction, show source provenance.

## Open Decisions

- Whether Open Design should keep one long-lived server per selected model or launch on demand per run.
- Whether embeddings should be mandatory for retrieval or whether lexical retrieval is enough for the first implementation.
- Whether large 30B models should be disabled by default until the first health check confirms acceptable local performance.
- Whether model scorecards should be global only or split by project as well as global.

## Acceptance Criteria

- All supported `.gguf` models under `/Users/Antman/Desktop/AI_Models/GGUF` are discoverable.
- The user can enable or disable each local model.
- The app can test a local model and record the result.
- Uploaded documents, files, and images can be stored as project sources.
- Text/previewable sources can be indexed and retrieved into design runs.
- Each local model accumulates completion, design, user, performance, and overall success scores.
- The router can select a model automatically based on task type and scorecard data.
- UI and CLI expose the same core capabilities.
