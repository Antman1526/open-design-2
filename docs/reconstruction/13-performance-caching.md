# 13 - Performance Optimization & Caching

## Current Performance Model

The app is optimized for local desktop use rather than multi-tenant scale.
SQLite, synchronous `better-sqlite3`, local file access, and direct process
spawning are acceptable for one owner and three testers. The main performance
risks are large source folders, slow local models, and heavyweight packaged
builds.

## Source Indexing Limits

Current constants:

```ts
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const CHUNK_CHARS = 4000;
const MAX_RETRIEVAL_CHUNKS = 8;
```

These protect prompt size and indexing time. The skipped directory list avoids
common high-volume folders:

```text
.git, .hg, .svn, .tmp, .turbo, .vite, build, coverage, dist,
node_modules, out
```

## Retrieval Performance

Keyword retrieval is cheap and deterministic but limited. It avoids a vector
database dependency and works before embeddings are configured. Performance is
bounded by:

- number of chunks per project
- chunk text length
- number of query terms
- `MAX_RETRIEVAL_CHUNKS`

Suggested index for current retrieval:

```sql
CREATE INDEX IF NOT EXISTS idx_project_source_chunks_project
  ON project_source_chunks(project_id, source_id, chunk_index);
```

Future improvement: SQLite FTS5 table for source chunks:

```sql
CREATE VIRTUAL TABLE project_source_chunks_fts
USING fts5(text, source_id UNINDEXED, project_id UNINDEXED);
```

## Local Model Performance

Model tests record latency and success rate. Routing should prefer:

1. matching task role
2. enabled model
3. higher success rate
4. lower average latency
5. fewer recent crashes/timeouts

Managed `llama-server` startup can dominate latency. Caching a warm server per
selected model improves repeated tests but uses memory. An idle shutdown timer
is a reasonable compromise.

## Web Performance

The web UI should avoid loading entire source contents into component state.
List views need only metadata:

- filename
- kind
- status
- chunk count
- size
- updated timestamp

Retrieval preview should fetch only top snippets.

## Packaging Performance

Electron packaging rebuilds native modules and bundles prebuilt web/daemon
resources. Slow steps:

- Next.js build
- Electron rebuild
- DMG creation
- hdiutil verification

Cache opportunities:

- pnpm store
- Next build cache
- Electron download cache
- rebuilt native module cache keyed by Electron ABI

## Areas for Review

- Should source indexing compute file hashes and skip unchanged files?
- Should retrieval use SQLite FTS5 before adding embeddings?
- Should the runner keep one warm `llama-server` process per active model?
- Should large indexing jobs run incrementally with UI progress events?

