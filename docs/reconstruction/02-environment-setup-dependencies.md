# 02 - Environment Setup & Dependencies

## Required Runtime

The root `package.json` pins the expected toolchain:

```json
{
  "packageManager": "pnpm@10.33.2",
  "type": "module",
  "engines": {
    "node": "~24",
    "pnpm": ">=10.33.2 <11"
  }
}
```

Use Node 24.x and pnpm 10.33.x. The repository uses ESM TypeScript throughout.
If `corepack` is enabled, the recommended install command is:

```bash
corepack enable
corepack pnpm install
```

## Local macOS Prerequisites

For this fork's local model and source workflows, install or verify:

```bash
node --version           # expected: v24.x
corepack pnpm --version  # expected: 10.33.x
sqlite3 --version        # useful for inspecting .od/app.sqlite
which llama-server       # expected for managed GGUF execution
which tesseract          # optional OCR for images
```

The default local model folder must exist:

```bash
mkdir -p /Users/Antman/Desktop/AI_Models/GGUF
```

Place `.gguf` model files under that `GGUF` folder. Existing Ollama or
OpenAI-compatible local servers may also be used.

## Root Scripts

Key scripts from the root workspace:

```json
{
  "scripts": {
    "tools-dev": "pnpm exec tools-dev",
    "tools-pack": "pnpm exec tools-pack",
    "guard": "tsx ./scripts/guard.ts && node --import tsx --test scripts/style-policy.test.ts scripts/approve-fork-pr-workflows.test.ts",
    "typecheck": "pnpm -r --workspace-concurrency=4 --if-present run typecheck && tsc -p scripts/tsconfig.json --noEmit"
  }
}
```

Common development commands:

```bash
corepack pnpm install
corepack pnpm tools-dev
corepack pnpm guard
corepack pnpm typecheck
corepack pnpm --filter @open-design/daemon test
corepack pnpm --filter @open-design/web test
```

## Daemon Dependencies

`apps/daemon` is the privileged Node service. Important direct dependencies:

| Dependency | Version | Project role |
| --- | ---: | --- |
| `express` | 5.2.1 | HTTP API server |
| `better-sqlite3` | 12.10.0 | Synchronous SQLite persistence |
| `multer` | 2.1.1 | Multipart file uploads |
| `undici` | 7.25.0 | HTTP client for model/provider calls |
| `chokidar` | 5.0.0 | Filesystem watching |
| `cheerio` | 1.2.0 | HTML parsing/extraction |
| `jszip` | 3.10.1 | ZIP import/export handling |
| `tar` | 7.5.15 | Archive handling |
| `prom-client` | 15.1.3 | Prometheus metrics |
| `posthog-node` | 5.34.6 | Server telemetry |
| `@modelcontextprotocol/sdk` | 1.29.0 | MCP protocol support |
| `vitest` | 4.1.6 | Daemon tests |

## Web Dependencies

`apps/web` is the Next.js/React UI. Important direct dependencies:

| Dependency | Version | Project role |
| --- | ---: | --- |
| `next` | 16.2.6 | Web app framework |
| `react` | 18.3.1 | UI rendering |
| `react-dom` | 18.3.1 | DOM renderer |
| `lucide-react` | 1.16.0 | Icon components |
| `openai` | 6.38.0 | OpenAI-compatible client usage |
| `@anthropic-ai/sdk` | 0.32.1 | Anthropic provider usage |
| `posthog-js` | 1.374.2 | Browser telemetry |
| `tailwindcss` | 4.3.0 | Styling utilities |
| `@testing-library/react` | 16.3.2 | Component tests |
| `jsdom` | 29.1.1 | Browser-like test DOM |

## Desktop and Packaging Dependencies

The packaged app uses Electron 41.3.0. Packaging uses `tools/pack`:

| Dependency | Version | Project role |
| --- | ---: | --- |
| `electron` | 41.3.0 | Desktop runtime |
| `electron-builder` | 26.8.1 | DMG/ZIP/installer generation |
| `@electron/rebuild` | 4.0.4 | Native module rebuilds for Electron ABI |
| `@electron/notarize` | 3.1.1 | Optional notarization support |
| `esbuild` | 0.28.0 | Bundling packaged/headless entries |
| `cac` | 6.7.14 | CLI parser for packaging tools |

## First Development Run

Recommended setup sequence:

```bash
cd /Users/Antman/Desktop/OpenDesign/open-design-2
corepack enable
corepack pnpm install
corepack pnpm --filter @open-design/contracts build
corepack pnpm --filter @open-design/daemon build
corepack pnpm --filter @open-design/web build
```

Start local development:

```bash
corepack pnpm tools-dev
```

Build a portable unsigned DMG:

```bash
corepack pnpm tools-pack mac build --to dmg --portable --json
```

## Packaged CLI Runtime Note

Do not run the packaged daemon CLI with Homebrew Node. Native modules are built
against Electron's ABI. Use the packaged app binary:

```bash
ELECTRON_RUN_AS_NODE=1 \
  "/Applications/Open Design.app/Contents/MacOS/Open Design" \
  "/Applications/Open Design.app/Contents/Resources/app/prebundled/apps/daemon/dist/cli.js" \
  --help
```

## Areas for Review

- Should `llama-server` path detection include a bundled binary for testers who
  do not use Homebrew?
- Should OCR tooling be bundled or explicitly left as optional host tooling?
- Should Node 24 be enforced by `.nvmrc` or `.node-version` for simpler setup?
- Should packaging produce a separate dev-signed build for the three test users?

