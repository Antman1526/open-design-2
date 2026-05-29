# 03 - Database Schema & Data Models

## Persistence Overview

The daemon stores application state in SQLite via `better-sqlite3`. Development
data defaults to:

```text
<repo>/.od/app.sqlite
```

Packaged app data defaults to:

```text
~/Library/Application Support/Open Design/namespaces/default/data/app.sqlite
```

The DB module runs migrations at daemon startup. Schema changes are additive and
guarded with `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and
column-existence checks.

## Core Tables

The base app stores projects, conversations, messages, previews, tabs,
deployments, routines, and routine runs.

```sql
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conv_project ON conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
```

Other important tables include `templates`, `preview_comments`, `tabs`,
`deployments`, `routines`, and `routine_runs`. These model reusable templates,
live preview annotations, open workspace tabs, deployment records, scheduled
automation-like routines, and their historical executions.

## Local Model Tables

The local model feature adds three tables.

```sql
CREATE TABLE IF NOT EXISTS local_models (
  id TEXT PRIMARY KEY,
  root TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  modified_at TEXT,
  family TEXT,
  role TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_model_runs (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  task TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL,
  server_mode TEXT NOT NULL,
  latency_ms INTEGER,
  sample TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_model_scorecards (
  model_id TEXT NOT NULL,
  task TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  successes INTEGER NOT NULL,
  failures INTEGER NOT NULL,
  timeouts INTEGER NOT NULL,
  crashes INTEGER NOT NULL,
  avg_latency_ms REAL,
  success_rate REAL NOT NULL,
  last_status TEXT NOT NULL,
  last_error TEXT,
  last_sample TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (model_id, task)
);
```

Indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_local_models_file_name
  ON local_models(file_name);

CREATE INDEX IF NOT EXISTS idx_local_model_runs_model_task
  ON local_model_runs(model_id, task, created_at);

CREATE INDEX IF NOT EXISTS idx_local_model_scorecards_rank
  ON local_model_scorecards(task, success_rate, avg_latency_ms);
```

The scorecard model is intentionally denormalized. It supports quick routing
without replaying all historical runs. A run still records raw outcome details
for debugging.

## Project Source Tables

Project sources are durable uploaded/reference files tied to a project.

```sql
CREATE TABLE IF NOT EXISTS project_sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes INTEGER NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_source_chunks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_sources_project
  ON project_sources(project_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_project_source_chunks_project
  ON project_source_chunks(project_id, source_id, chunk_index);
```

`kind` values are derived from file type and extraction path:

- `text`
- `code`
- `html`
- `pdf`
- `document`
- `spreadsheet`
- `presentation`
- `image`
- `binary`

`status` values:

- `indexed`: text chunks are available.
- `metadata_only`: file is preserved but no text was extracted.
- `error`: extraction failed and the error is recorded.

## Data Model Contracts

Shared Zod DTOs live in `packages/contracts/src/api`. The local-model DTOs
include model metadata, diagnostics, scorecards, and test responses. The source
DTOs include source metadata, index responses, and retrieval preview chunks.

Representative pattern:

```ts
export const LocalModelTaskSchema = z.enum([
  "design",
  "code",
  "summary",
  "critique",
  "repair",
]);
```

These contracts are used in daemon tests and web state code to keep API
responses stable.

## Edge Cases

- A missing model root is not fatal; diagnostics report `exists: false`.
- A missing `GGUF` folder is reported separately from a missing root.
- A scanned model can be disabled without deleting score history.
- Unsupported source files remain visible as `metadata_only`.
- OCR failures do not fail the upload; image metadata remains indexed.
- Existing source chunks are replaced during re-index to avoid stale retrieval.

## Areas for Review

- Should source chunks include a content hash to skip unchanged files?
- Should model scorecards expire old failures after a configurable period?
- Should source tables enforce foreign keys to `projects`, or keep loose
  coupling for repairability?
- Should chunk text move to a content-addressed blob store if SQLite size grows?

