# 05 - Frontend Architecture & Components

## Frontend Overview

The web app lives in `apps/web` and uses Next.js 16, React 18, Tailwind 4, and
plain React state modules. It talks to the daemon HTTP API for local-only
capabilities. The UI is designed around a design workspace:

- project/conversation selection
- skill and design-system selection
- chat/design prompt entry
- artifact preview
- file/source panels
- local model settings
- provider settings and runtime status

## Component Organization

Important folders:

```text
apps/web/src/
  components/              Workspace and settings components
  state/                   API-backed state stores and hooks
  api-attachment-context.ts Prompt source-context injection helper
  sidecar/                 Desktop sidecar integration
```

The new source and local-model UI additions are:

```text
apps/web/src/components/LocalModelsSection.tsx
apps/web/src/components/DesignSourcesPanel.tsx
apps/web/src/state/local-models.ts
apps/web/src/state/project-sources.ts
apps/web/src/api-attachment-context.ts
```

## Local Models Settings UI

`LocalModelsSection` lets a tester configure the model root, diagnose host
paths, scan GGUF models, run tests, inspect scorecards, and enable/disable
models.

State persisted in `localStorage`:

```ts
const ROOT_STORAGE_KEY = "open-design.localModelRoot";
const LLAMA_SERVER_STORAGE_KEY = "open-design.llamaServerBin";
const DEFAULT_ROOT = "/Users/Antman/Desktop/AI_Models";
```

Representative state flow:

```ts
const diagnostics = await diagnoseLocalModels({
  root,
  llamaServerBin,
});

const scan = await scanLocalModels({ root });

const result = await testLocalModel(model.id, {
  task: selectedTask,
  root,
  llamaServerBin,
});
```

UI states that must be implemented:

- empty/missing model root
- missing `GGUF` folder
- missing `llama-server`
- scan in progress
- no GGUF models found
- test in progress per model
- scorecard success/failure/timeout/crash display
- enable/disable toggle

## Design Sources Panel

`DesignSourcesPanel` is the UI for durable project source indexing and
retrieval preview. It keeps the existing attachment behavior but adds a
project-level "Use in prompts" toggle.

Local storage key pattern:

```ts
`open-design.projectSources.${projectId}.enabled`
```

Core API flow:

```ts
await listProjectSources(projectId);
await indexProjectSources(projectId);
await previewProjectSourceRetrieval(projectId, query);
```

Expected UI behavior:

- list sources with filename, kind, status, size, and chunk count
- run indexing on demand
- show metadata-only sources without treating them as errors
- show extraction errors per source
- preview query-based retrieval
- toggle injection into prompts

## Prompt Context Injection

`api-attachment-context.ts` is the frontend boundary that appends retrieved
source context to the user's design prompt. It must not silently turn uploaded
files into trusted instructions.

Representative pattern:

```ts
export async function appendAttachmentContext(input: {
  projectId: string;
  content: string;
  includeProjectSources: boolean;
}) {
  if (!input.includeProjectSources) return input.content;

  const preview = await previewProjectSourceRetrieval(input.projectId, {
    query: input.content,
  });

  if (preview.chunks.length === 0) return input.content;

  return `${input.content}\n\n${formatProjectSourceContext(preview.chunks)}`;
}
```

The formatted context includes filenames and chunk indexes so provenance can be
shown in events/UI and used for debugging.

## State Modules

State modules are thin API clients with typed response parsing. They should
avoid duplicating daemon business logic. Expected concerns:

- request construction
- response validation where contracts are available
- user-friendly error strings
- local UI loading/error state

## Edge Cases

- The user may switch projects while an index request is still in flight.
- Source preview query can be empty; fallback to recently indexed chunks or
  return an empty preview consistently.
- Local storage can contain a stale external-drive path.
- A model can disappear after scanning if an external drive is unmounted.
- Packaged app daemon URL may differ from local dev URL; API clients should use
  existing daemon base resolution patterns.

## Areas for Review

- Should model/source state move to a shared store to avoid prop drilling?
- Should source provenance be rendered in the chat transcript, not only preview
  panels?
- Should the UI support selecting individual sources per run?
- Should large source indexing move to background progress events over SSE?

