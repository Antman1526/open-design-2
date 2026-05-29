# 07 - Business Logic & Core Algorithms

## Design Run Business Logic

At a high level, a design run composes:

1. user prompt
2. selected skill instructions
3. selected design-system guidance
4. active project files
5. optional uploaded source retrieval context
6. provider/agent/local-model execution
7. streamed events and artifact rendering

The important behavior is that design generation is file-backed. The model or
agent creates actual files in a project workspace, and the UI previews the
result instead of storing only chat text.

## Local Model Discovery

The scan algorithm:

1. Resolve root, defaulting to `/Users/Antman/Desktop/AI_Models`.
2. Resolve `ggufDir = path.join(root, "GGUF")`.
3. Check existence/readability.
4. List `.gguf` files.
5. Upsert each file into `local_models`.
6. Derive family and role priors from filename.

Representative role-prior logic:

```ts
function inferModelRole(fileName: string): LocalModelRole {
  const lower = fileName.toLowerCase();
  if (lower.includes("embed") || lower.includes("nomic")) return "embedding";
  if (lower.includes("coder") || lower.includes("code")) return "code";
  if (lower.includes("deepseek") || lower.includes("reason")) return "repair";
  if (lower.includes("qwen") || lower.includes("mistral")) return "design";
  return "summary";
}
```

Filename priors are intentionally weak. Scorecard data should supersede them
after tests have run.

## Local Model Test Algorithm

Execution order:

1. Try known OpenAI-compatible local endpoints.
2. Try Ollama's OpenAI-compatible endpoint.
3. Launch managed `llama-server` for the selected GGUF model.
4. Send a task-specific prompt.
5. Record run status, latency, sample output, server mode, and errors.
6. Update aggregate scorecard.

Status categories:

- `success`
- `failure`
- `timeout`
- `crash`

Scorecard update formula:

```ts
successRate = successes / attempts;
avgLatencyMs = successfulLatencyTotal / successes;
```

Routing prefers enabled models with higher success rate and lower average
latency for the requested task.

## Local Model Routing

Task routing rules:

- embeddings: `nomic-embed-text` or filename role `embedding`
- summaries: smaller fast models
- design: Qwen, Mistral, Hermes, Gemma style models
- code: Qwen coder or code-specialized models
- critique/repair: DeepSeek, Qwen coder, larger reasoning models

Routing record should include:

- requested task
- selected model ID
- server mode
- fallback attempts
- outcome
- latency

## Source Indexing Algorithm

Important constants:

```ts
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const CHUNK_CHARS = 4000;
const MAX_RETRIEVAL_CHUNKS = 8;
```

Skipped path segments:

```ts
const SKIPPED_SEGMENTS = new Set([
  ".git", ".hg", ".svn", ".tmp", ".turbo", ".vite",
  "build", "coverage", "dist", "node_modules", "out",
]);
```

Extraction strategy:

- text/code/html/markdown: read UTF-8 up to max bytes
- PDF/doc/spreadsheet/presentation: use document preview extraction
- image: record metadata and optionally OCR through `tesseract`
- unsupported binary: metadata-only

Chunking strategy:

```ts
function chunkText(text: string): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += CHUNK_CHARS) {
    chunks.push(text.slice(index, index + CHUNK_CHARS));
  }
  return chunks;
}
```

## Retrieval Algorithm

Retrieval is keyword-based:

1. Normalize query to lower-case terms.
2. Score each chunk by term occurrence.
3. Prefer higher scores.
4. Limit to `MAX_RETRIEVAL_CHUNKS`.
5. Return filename, chunk index, score, and text.

This is deterministic and requires no embedding model, which is useful before
local embedding routing is fully proven.

## Areas for Review

- Should source chunking use semantic boundaries instead of fixed characters?
- Should retrieval combine keyword, recency, source selection, and embeddings?
- Should model tests run a calibrated benchmark rather than one sample prompt?
- Should `llama-server` lifecycle include an idle shutdown timer and health
  endpoint checks?

