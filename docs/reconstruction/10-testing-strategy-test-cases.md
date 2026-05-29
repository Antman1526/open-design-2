# 10 - Testing Strategy & Test Cases

## Test Frameworks

The project uses:

- Vitest 4.1.6 for package/app tests
- TypeScript typechecks as first-class verification
- Node's built-in test runner for selected root guard tests
- Playwright/e2e infrastructure in the broader repo
- Packaged smoke tests for DMG behavior

Core verification commands:

```bash
corepack pnpm guard
corepack pnpm typecheck
corepack pnpm --filter @open-design/contracts test
corepack pnpm --filter @open-design/daemon test
corepack pnpm --filter @open-design/web test
```

## Contract Tests

Contracts under `packages/contracts` should test DTO parsing for:

- local model list responses
- diagnostics responses
- model test responses
- scorecards
- project source records
- source index results
- retrieval preview chunks

Example expectation:

```ts
expect(LocalModelTaskSchema.parse("design")).toBe("design");
expect(() => LocalModelTaskSchema.parse("unknown")).toThrow();
```

## Daemon Tests

Focused daemon tests should cover:

- local model root diagnostics
- GGUF scanning
- role/family inference from filenames
- local model enable/disable
- scorecard update math
- OpenAI-compatible endpoint fallback
- managed `llama-server` failure handling
- source table migrations
- source indexing for text files
- metadata-only handling for unsupported binaries
- OCR fallback when `tesseract` is missing
- retrieval ranking and max chunk limits
- packaged data directory resolution
- daemon start command staying alive

Previously verified focused command:

```bash
corepack pnpm --filter @open-design/daemon test -- \
  tests/local-models.test.ts \
  tests/local-model-routes.test.ts \
  tests/local-models-cli.test.ts \
  tests/project-sources.test.ts \
  tests/resolve-data-dir.test.ts \
  tests/daemon-start-cli.test.ts
```

## Web Tests

Web tests should cover:

- local model state API clients
- Local Models settings panel states
- project source state API clients
- Design Sources panel actions
- source-context formatting
- prompt injection disabled/enabled behavior
- localStorage default root and per-project settings

Focused command:

```bash
corepack pnpm --filter @open-design/web test -- \
  tests/state/local-models.test.ts \
  tests/components/local-models-section.test.tsx \
  tests/api-attachment-context.test.ts \
  tests/state/project-sources.test.ts
```

## Packaged Smoke Tests

DMG build:

```bash
corepack pnpm tools-pack mac build --to dmg --portable --json
```

Verify:

```bash
hdiutil verify "/Users/Antman/Desktop/OpenDesign/Open Design-default.dmg"
shasum -a 256 "/Users/Antman/Desktop/OpenDesign/Open Design-default.dmg"
```

Packaged daemon CLI smoke must use Electron:

```bash
ELECTRON_RUN_AS_NODE=1 \
  "/Volumes/Open Design/Open Design.app/Contents/MacOS/Open Design" \
  "/Volumes/Open Design/Open Design.app/Contents/Resources/app/prebundled/apps/daemon/dist/cli.js" \
  local-models diagnostics --root /Users/Antman/Desktop/AI_Models --json
```

Expected diagnostic assertions:

- root exists and is readable
- `GGUF` folder exists and is readable
- model count is non-zero when models are present
- `llama-server` path is detected or clearly missing

## Test Data

Use small fixtures:

- one `.txt` brand brief
- one `.md` requirements file
- one unsupported binary placeholder
- one tiny PNG or JPEG for metadata-only image tests
- fake `.gguf` names for scan tests without loading model content

Avoid committing real model files.

## Areas for Review

- Should a nightly local eval run test every model under
  `/Users/Antman/Desktop/AI_Models/GGUF`?
- Should packaged smoke become an automated script committed to `tools/pack`?
- Should source indexing tests include real PDF/docx/xlsx/pptx fixtures?
- Should web tests assert visual layout with Playwright screenshots?

