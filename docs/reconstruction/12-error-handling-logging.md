# 12 - Error Handling & Logging

## Error Handling Principles

The app should prefer recoverable, per-feature errors over whole-app failures:

- missing local model root: diagnostic warning
- missing `GGUF`: diagnostic warning
- missing `llama-server`: managed runner unavailable, existing endpoints still usable
- source extraction failure: mark that source as `error`
- unsupported source binary: mark `metadata_only`
- OCR missing: image source remains metadata-only
- model timeout/crash: record run and update scorecard

## Daemon HTTP Errors

Recommended JSON shape:

```json
{
  "error": "Human-readable error",
  "code": "OPTIONAL_MACHINE_CODE"
}
```

Status conventions:

- 400 for invalid request bodies or query params
- 404 for missing projects/models/sources
- 409 for conflicting state when applicable
- 500 for unexpected daemon failures

## Local Model Run Errors

Run failures are data, not just logs. Store:

- model ID
- task
- status
- server mode
- latency if available
- sample output if successful
- error string if failed
- created timestamp

Scorecards aggregate:

- attempts
- successes
- failures
- timeouts
- crashes
- average latency
- success rate
- last error
- last sample

This makes the Settings UI and routing decisions explainable.

## Source Indexing Errors

Each source should have independent status:

```json
{
  "fileName": "large-binary.bin",
  "status": "metadata_only",
  "chunkCount": 0,
  "error": null
}
```

For extraction failures:

```json
{
  "fileName": "broken.pdf",
  "status": "error",
  "chunkCount": 0,
  "error": "PDF preview extraction failed"
}
```

The index endpoint should still return other successfully indexed files.

## Logging Strategy

Log useful operational facts:

- daemon start port and data directory
- diagnostics summary without secrets
- model scan counts
- model test result status and latency
- source indexing counts
- packaged data directory decisions

Do not log:

- full API keys
- `.env` file values
- complete uploaded source text by default
- full model prompts if they may contain private docs

## Debug Procedures

Local model diagnostics:

```bash
od local-models diagnostics --root /Users/Antman/Desktop/AI_Models --json
od local-models scan --root /Users/Antman/Desktop/AI_Models --json
```

Inspect SQLite:

```bash
sqlite3 .od/app.sqlite ".tables"
sqlite3 .od/app.sqlite "select file_name, role, enabled from local_models;"
sqlite3 .od/app.sqlite "select file_name, status, chunk_count from project_sources;"
```

Packaged data:

```bash
sqlite3 "$HOME/Library/Application Support/Open Design/namespaces/default/data/app.sqlite" ".tables"
```

## Areas for Review

- Should daemon logs be structured JSON for easier tester collection?
- Should source extraction errors include a stable code in addition to text?
- Should the UI expose a "copy diagnostics bundle" action?
- Should model test prompts and samples be opt-in persisted for privacy?

