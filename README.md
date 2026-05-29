# Open Design 2 - Local-First Design Workspace

This repository is Antman's fork of Open Design. It is a local-first design
generation workspace with a Next.js web UI, a privileged Node/Electron daemon,
SQLite persistence, design skills, design systems, local file/source ingestion,
and local LLM support.

Fork target:

```text
https://github.com/Antman1526/open-design-2
```

Canonical local paths for this fork:

```text
Repository:       /Users/Antman/Desktop/OpenDesign/open-design-2
Desktop folder:  /Users/Antman/Desktop/OpenDesign
Local models:    /Users/Antman/Desktop/AI_Models
GGUF models:     /Users/Antman/Desktop/AI_Models/GGUF
```

## What This App Does

Open Design turns a design brief into a real, file-backed design artifact. The
user can choose a skill, select a design system, upload supporting documents or
images, and run a generation flow through a coding-agent CLI, a BYOK provider,
an existing local OpenAI-compatible server, Ollama, or a managed `llama-server`
process for GGUF models.

The app is built for private local use and a small tester group. It is not
configured as a public multi-tenant SaaS application.

## New Fork Features

This fork adds local-file and local-LLM functionality:

- Project sources: uploaded documents, files, PDFs, spreadsheets,
  presentations, text/code files, and images can be indexed as durable project
  sources.
- Retrieval into prompts: indexed source chunks can be retrieved and appended
  to design prompts under an explicit untrusted-reference boundary.
- Image metadata and OCR fallback: image dimensions, MIME type, filename, and
  size are indexed; OCR is attempted when local tooling is available.
- Local model scanning: GGUF models are scanned from
  `/Users/Antman/Desktop/AI_Models/GGUF`.
- Launch detection: the daemon scans for new GGUF models during startup so new
  files copied into the model folder appear automatically after relaunch.
- Non-blocking startup scan: the daemon starts listening immediately and exposes
  scan progress at `/api/local-models/scan-status`.
- Settings startup refresh: the Local Models panel polls startup scan status and
  refreshes automatically when new launch-detected models are persisted.
- Missing-model handling: models that disappear from the scanned folder are
  marked unavailable and excluded from routing until they are seen again.
- Auto-hybrid model runner: the daemon tries existing OpenAI-compatible local
  endpoints, then Ollama, then managed `llama-server`.
- Scorecards: model tests record latency, completion status, timeout/crash
  information, sample output, and success rate by task.
- Web research tools: External MCP includes a Web research category with a
  Kindly Web Search preset for explicit web search/content retrieval. Local
  models do not browse the internet by themselves; they use MCP/search tools
  only when a run exposes those tools. Returned content is treated as
  untrusted evidence, and the system prompt blocks external MCP web/content
  tools from fetching localhost, private-network, link-local, or
  metadata-service URLs unless the user explicitly provides the exact URL.
- UI parity: Settings includes local model diagnostics/scan/test controls; the
  workspace includes a Design Sources panel.
- CLI parity: `od model test` and `od sources` commands expose the same flows.
- Packaged smoke support: packaged daemon CLI runs through Electron with
  `ELECTRON_RUN_AS_NODE=1` so native modules match Electron's ABI.

## Architecture

```text
apps/
  daemon/       Express daemon, SQLite, local models, source indexing, CLI
  web/          Next.js/React UI
  desktop/      Electron development shell
  packaged/     Electron packaged shell/headless entry
packages/
  contracts/    Shared Zod API DTOs
  platform/     OS/runtime helpers
  sidecar*/     Desktop sidecar protocol/runtime
tools/
  dev/          Local development process runner
  pack/         Electron packaging pipeline
skills/         Design skills
design-systems/ Design-system assets
docs/reconstruction/ Full technical reconstruction docs
```

Runtime flow:

```text
User -> Web UI -> Local daemon -> SQLite / project files / agent CLI / local LLM
```

The daemon is the only process that should perform privileged work such as
filesystem access, source indexing, model scanning, `llama-server` launch, or
coding-agent process spawning.

## Requirements

Required:

- macOS for the packaged DMG workflow
- Node.js `~24`
- pnpm `>=10.33.2 <11`
- Corepack

Recommended local tools:

- `llama-server` for managed GGUF execution
- `tesseract` for optional image OCR
- `sqlite3` for local database inspection

Install dependencies:

```bash
cd /Users/Antman/Desktop/OpenDesign/open-design-2
corepack enable
corepack pnpm install
```

## Local Models

Default model root:

```text
/Users/Antman/Desktop/AI_Models
```

Expected GGUF folder:

```text
/Users/Antman/Desktop/AI_Models/GGUF
```

The runner resolves execution in this order:

1. Existing OpenAI-compatible endpoint at `http://127.0.0.1:8080/v1` or
   `http://127.0.0.1:8000/v1`.
2. Existing Ollama endpoint at `http://127.0.0.1:11434/v1`.
3. Managed `llama-server` for the selected GGUF model.

On daemon launch, Open Design scans the configured model root automatically.
The launch scan can be configured with:

```bash
OD_LOCAL_MODEL_ROOT=/Users/Antman/Desktop/AI_Models
OD_LOCAL_MODEL_SCAN_ON_STARTUP=1
```

Set `OD_LOCAL_MODEL_SCAN_ON_STARTUP=0` only when you explicitly want to disable
startup detection, such as isolated test runs.

Startup scan status:

```text
GET /api/local-models/scan-status
```

This returns `idle`, `running`, `completed`, or `failed` plus the scanned root
and counts. Missing/unmounted model files remain listed for visibility but are
marked unavailable and skipped by automatic routing.

Useful CLI examples:

```bash
od local-models diagnostics --root /Users/Antman/Desktop/AI_Models --json
od local-models scan --root /Users/Antman/Desktop/AI_Models --json
od model test <model-id> --task design --json
```

Supported task names:

```text
design, code, summary, critique, repair
```

## Project Sources

Project sources let uploaded files influence design generation without being
treated as trusted instructions.

Routes:

```text
GET  /api/projects/:id/sources
POST /api/projects/:id/sources/index
GET  /api/projects/:id/sources/retrieval-preview
```

CLI:

```bash
od sources list <projectId> --json
od sources index <projectId> --json
od sources preview <projectId> --query "brand tone" --json
```

Indexed source text is injected into prompts inside an untrusted-reference
boundary so the model can use the uploaded material for facts and constraints
without following instructions embedded in those files.

## Development

Start the development stack:

```bash
corepack pnpm tools-dev
```

Run important checks:

```bash
corepack pnpm guard
corepack pnpm typecheck
corepack pnpm --filter @open-design/contracts test
corepack pnpm --filter @open-design/daemon test
corepack pnpm --filter @open-design/web test
```

Focused tests for the local model/source work:

```bash
corepack pnpm --filter @open-design/daemon test -- \
  tests/local-models.test.ts \
  tests/local-model-routes.test.ts \
  tests/local-models-cli.test.ts \
  tests/project-sources.test.ts \
  tests/resolve-data-dir.test.ts \
  tests/daemon-start-cli.test.ts

corepack pnpm --filter @open-design/web test -- \
  tests/state/local-models.test.ts \
  tests/components/local-models-section.test.tsx \
  tests/api-attachment-context.test.ts \
  tests/state/project-sources.test.ts
```

## Build DMG

Build an unsigned local portable DMG:

```bash
corepack pnpm tools-pack mac build --to dmg --portable --json
```

Verify:

```bash
hdiutil verify "/Users/Antman/Desktop/OpenDesign/Open Design-default.dmg"
shasum -a 256 "/Users/Antman/Desktop/OpenDesign/Open Design-default.dmg"
```

Packaged daemon CLI note:

```bash
ELECTRON_RUN_AS_NODE=1 \
  "/Applications/Open Design.app/Contents/MacOS/Open Design" \
  "/Applications/Open Design.app/Contents/Resources/app/prebundled/apps/daemon/dist/cli.js" \
  --help
```

Do not run the packaged daemon CLI with Homebrew Node. Native modules such as
`better-sqlite3` are built for Electron's ABI in the packaged app.

## Documentation

The reconstruction documentation set is in:

```text
docs/reconstruction/
```

Start with:

- `docs/reconstruction/INDEX.md`
- `docs/reconstruction/01-project-overview-architecture.md`
- `docs/reconstruction/TECHNOLOGY_AUDIT.md`

These documents are intentionally dense. They are written so another AI system
or senior engineer can reconstruct the project architecture, identify
dependencies, understand data flow, and find concrete opportunities for
optimization or refactoring.

## License

Apache-2.0. See `LICENSE`.
