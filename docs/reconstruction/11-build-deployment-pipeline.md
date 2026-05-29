# 11 - Build & Deployment Pipeline

## Build Targets

The project has four main build targets:

- daemon TypeScript to Node ESM
- web Next.js application
- desktop Electron development shell
- packaged Electron app with prebundled daemon/web resources

Root command:

```bash
corepack pnpm typecheck
```

Build important packages:

```bash
corepack pnpm --filter @open-design/contracts build
corepack pnpm --filter @open-design/daemon build
corepack pnpm --filter @open-design/web build
corepack pnpm --filter @open-design/desktop build
corepack pnpm --filter @open-design/packaged build
```

## Development Run

Use:

```bash
corepack pnpm tools-dev
```

`tools-dev` orchestrates daemon, web, and optionally desktop processes with
typed sidecar status.

## macOS DMG Build

Unsigned local portable DMG:

```bash
corepack pnpm tools-pack mac build --to dmg --portable --json
```

The result should be copied to:

```text
/Users/Antman/Desktop/OpenDesign/Open Design-default.dmg
```

Verification:

```bash
hdiutil verify "/Users/Antman/Desktop/OpenDesign/Open Design-default.dmg"
shasum -a 256 "/Users/Antman/Desktop/OpenDesign/Open Design-default.dmg"
```

## Native Module Constraint

`better-sqlite3` and other native modules are built for Electron in packaged
builds. Therefore packaged daemon CLI smoke tests must execute with the
packaged Electron binary:

```bash
ELECTRON_RUN_AS_NODE=1 "/path/to/Open Design.app/Contents/MacOS/Open Design" \
  "/path/to/Open Design.app/Contents/Resources/app/prebundled/apps/daemon/dist/cli.js" \
  --help
```

Running that prebundled daemon with `/opt/homebrew/bin/node` is unsupported.

## GitHub Push Workflow

For this fork:

```bash
git remote -v
# origin https://github.com/Antman1526/open-design-2.git

git status --short
git add -A
git commit -m "Add local model sources support and reconstruction docs"
git push origin main
```

If remote is ahead, use non-destructive rebase:

```bash
git fetch origin
git pull --rebase origin main
git push origin main
```

Do not use `git reset --hard` or force push unless explicitly requested.

## Release Artifacts

Private tester artifacts should include:

- `Open Design-default.dmg`
- SHA-256 checksum
- tester notes
- packaged CLI wrapper instructions
- model root setup instruction
- source upload/index smoke checklist

## Areas for Review

- Should tester DMGs be signed with a Developer ID certificate?
- Should packaging emit checksum and smoke-test JSON automatically?
- Should wrapper scripts be included in release assets?
- Should GitHub Actions build this fork's private tester DMG?

