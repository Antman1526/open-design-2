# 04 - Backend API Specifications

## Daemon API Overview

The daemon is an Express 5 service. It owns all privileged actions:

- project file reads/writes
- upload handling
- source indexing
- local model scanning/testing
- SQLite persistence
- coding-agent process spawning
- provider proxying
- packaged/headless CLI behavior

Responses are JSON unless a route streams data or serves files.

## Local Model Routes

### `GET /api/local-models`

Returns scanned local models and scorecards.

Response shape:

```json
{
  "root": "/Users/Antman/Desktop/AI_Models",
  "models": [
    {
      "id": "model_...",
      "fileName": "qwen-coder.gguf",
      "filePath": "/Users/Antman/Desktop/AI_Models/GGUF/qwen-coder.gguf",
      "fileSizeBytes": 123456,
      "family": "qwen",
      "role": "code",
      "enabled": true
    }
  ],
  "scorecards": []
}
```

### `POST /api/local-models/diagnostics`

Request:

```json
{
  "root": "/Users/Antman/Desktop/AI_Models",
  "llamaServerBin": "/opt/homebrew/bin/llama-server"
}
```

Reports readability of the root, `GGUF` folder, and `llama-server` binary.

### `POST /api/local-models/scan`

Scans `.gguf` files under `<root>/GGUF`, upserts `local_models`, and returns the
updated list. Filename-derived family/role priors are used until scorecard data
exists.

### `PATCH /api/local-models/:id`

Request:

```json
{ "enabled": false }
```

Toggles whether a model can be used by routing.

### `GET /api/local-models/scorecards`

Returns per-model/per-task scorecards sorted for display and routing.

### `POST /api/local-models/:id/test`

Request:

```json
{
  "task": "design",
  "root": "/Users/Antman/Desktop/AI_Models",
  "llamaServerBin": "/opt/homebrew/bin/llama-server",
  "timeoutMs": 45000
}
```

Response:

```json
{
  "run": {
    "modelId": "model_...",
    "task": "design",
    "status": "success",
    "serverMode": "llama-server",
    "latencyMs": 9214,
    "sample": "A concise design response..."
  },
  "scorecard": {
    "attempts": 1,
    "successes": 1,
    "successRate": 1,
    "avgLatencyMs": 9214
  }
}
```

## Project Source Routes

### `GET /api/projects/:id/sources`

Lists project sources and indexing state.

Response:

```json
{
  "sources": [
    {
      "id": "src_...",
      "projectId": "proj_...",
      "fileName": "brand-notes.pdf",
      "kind": "pdf",
      "status": "indexed",
      "chunkCount": 4,
      "metadata": { "mimeType": "application/pdf" }
    }
  ]
}
```

### `POST /api/projects/:id/sources/index`

Indexes uploaded project files. It uses existing project file/upload locations
and creates/updates `project_sources` and `project_source_chunks`.

Response:

```json
{
  "sources": [
    { "id": "src_...", "status": "indexed", "chunkCount": 3 }
  ],
  "indexed": 1,
  "metadataOnly": 0,
  "errors": 0
}
```

### `GET /api/projects/:id/sources/retrieval-preview?query=...`

Ranks chunks for a query and returns the exact snippets that would be injected.

Response:

```json
{
  "query": "landing page tone",
  "chunks": [
    {
      "sourceId": "src_...",
      "fileName": "brand.md",
      "chunkIndex": 0,
      "score": 5,
      "text": "Brand voice: direct, helpful, concise..."
    }
  ]
}
```

## CLI Commands

The daemon CLI exposes local model and source commands.

```bash
od model test <model-id> --task design --json
od sources list <projectId> --json
od sources index <projectId> --json
od sources preview <projectId> --query "brand voice" --json
```

Packaged CLI execution must use Electron as Node:

```bash
ELECTRON_RUN_AS_NODE=1 "/Applications/Open Design.app/Contents/MacOS/Open Design" \
  ".../apps/daemon/dist/cli.js" model test <model-id> --json
```

## Representative Route Registration

The server registers feature-specific route modules from `apps/daemon/src/server.ts`.
The local model route and project source route follow this pattern:

```ts
app.get("/api/local-models", (_req, res) => {
  res.json(listLocalModelsWithScorecards());
});

app.post("/api/projects/:id/sources/index", async (req, res) => {
  const result = await indexProjectSources(req.params.id);
  res.json(result);
});
```

## Error Behavior

- Validation errors return 400 with a JSON error message.
- Missing records return 404.
- Source extraction failures are represented per source, not as whole-request
  failures unless the project itself is invalid.
- Local model test failures are recorded as run outcomes and scorecard updates.
- Timeouts and crashes are first-class scorecard counters.

## Areas for Review

- Should long-running indexing and model tests use async job IDs instead of
  synchronous HTTP requests?
- Should every route validate with contract Zod schemas at runtime?
- Should CLI command output be generated from the same DTO serializer as HTTP?
- Should local model test samples be redacted/truncated before persistence?

