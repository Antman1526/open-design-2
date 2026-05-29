# 09 - Configuration & Environment Variables

## Configuration Layers

Open Design configuration comes from:

1. root/package workspace scripts
2. daemon CLI flags
3. localStorage in the web UI
4. environment variables for providers/telemetry/builds
5. SQLite persisted settings and project records
6. packaged app runtime path detection

The fork-specific defaults are intentionally concrete for the owner's machine:

```text
LOCAL_MODEL_ROOT=/Users/Antman/Desktop/AI_Models
GGUF_DIR=/Users/Antman/Desktop/AI_Models/GGUF
```

Daemon launch scanning defaults to enabled. These environment variables control
startup detection:

```bash
OD_LOCAL_MODEL_ROOT=/Users/Antman/Desktop/AI_Models
OD_LOCAL_MODEL_SCAN_ON_STARTUP=1
```

Use `OD_LOCAL_MODEL_SCAN_ON_STARTUP=0` to suppress launch scanning for tests or
diagnostic runs.

The launch scan is non-blocking. Runtime scan state is available at
`GET /api/local-models/scan-status`.

## Root Package Configuration

Root package values:

```json
{
  "name": "open-design",
  "version": "0.8.0",
  "private": true,
  "packageManager": "pnpm@10.33.2",
  "type": "module",
  "license": "Apache-2.0",
  "bin": {
    "od": "./apps/daemon/dist/cli.js"
  }
}
```

Important pnpm native-build allowlist:

```json
{
  "onlyBuiltDependencies": [
    "better-sqlite3",
    "core-js",
    "electron",
    "electron-winstaller",
    "esbuild",
    "protobufjs",
    "sharp"
  ]
}
```

This matters for packaging because native modules must be rebuilt for Electron.

## Local Model UI Configuration

`apps/web/src/components/LocalModelsSection.tsx` stores host-local settings in
browser localStorage:

```ts
open-design.localModelRoot      // default /Users/Antman/Desktop/AI_Models
open-design.llamaServerBin      // optional explicit llama-server path
```

These values are sent to daemon diagnostics, scan, and test calls. They are not
global secrets and can be reset by clearing localStorage.

## Project Source UI Configuration

Per-project source injection is controlled by:

```ts
open-design.projectSources.${projectId}.enabled
```

When disabled, indexed source files remain stored but are not appended to design
prompts.

## Provider Environment Variables

Provider keys must be sanitized in documentation. Expected examples:

```bash
OPENAI_API_KEY=sk-REDACTED
ANTHROPIC_API_KEY=sk-ant-REDACTED
AZURE_OPENAI_API_KEY=REDACTED
AZURE_OPENAI_ENDPOINT=https://example.openai.azure.com
GOOGLE_API_KEY=REDACTED
POSTHOG_API_KEY=REDACTED
```

Do not commit real `.env` files. If sample files are needed, use `.env.example`
with placeholders only.

## Daemon Data Directory Resolution

Development default:

```text
<projectRoot>/.od
```

Packaged app default:

```text
~/Library/Application Support/Open Design/namespaces/default/data
```

Packaged detection must recognize a project root under:

```text
Open Design.app/Contents/Resources/app/prebundled
```

This prevents the packaged CLI from writing into the read-only app bundle.

## CLI Configuration Examples

Local model scan:

```bash
od model scan --root /Users/Antman/Desktop/AI_Models --json
```

Model test:

```bash
od model test <model-id> \
  --task design \
  --root /Users/Antman/Desktop/AI_Models \
  --llama-server-bin /opt/homebrew/bin/llama-server \
  --json
```

Project sources:

```bash
od sources list <projectId> --json
od sources index <projectId> --json
od sources preview <projectId> --query "visual tone" --json
```

## Areas for Review

- Should local model root and llama-server path also be persisted in SQLite so
  all browsers/Electron windows share one setting?
- Should packaged builds include a first-run configuration wizard?
- Should provider env var names be centralized in contracts or diagnostics?
- Should source injection default be globally configurable for tester builds?
