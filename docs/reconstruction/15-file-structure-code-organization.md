# 15 - File Structure & Code Organization

## Repository Layout

```text
open-design-2/
  apps/
    daemon/
      src/
        cli.ts
        db.ts
        server.ts
        local-models.ts
        local-model-routes.ts
        project-sources.ts
        project-source-routes.ts
      tests/
    web/
      app/
      src/
        components/
        state/
        api-attachment-context.ts
      tests/
    desktop/
    packaged/
  packages/
    contracts/
      src/api/local-models.ts
      src/api/project-sources.ts
    platform/
    sidecar/
    sidecar-proto/
    host/
    plugin-runtime/
  tools/
    dev/
    pack/
    serve/
  skills/
  design-systems/
  docs/reconstruction/
```

## Daemon Organization

The daemon should keep route handlers thin and put business logic in feature
modules.

Recommended pattern:

```text
local-model-routes.ts   HTTP parsing, status codes, response serialization
local-models.ts         scanning, diagnostics, runner, scorecards
project-source-routes.ts HTTP endpoints for sources
project-sources.ts      extraction, chunking, retrieval, DB writes
db.ts                   migrations and database handle
cli.ts                  command parser and command dispatch
server.ts               Express app composition
```

This separation makes daemon logic testable without HTTP.

## Contracts Organization

Shared DTOs live under:

```text
packages/contracts/src/api/
```

Feature contracts should export:

- request schema
- response schema
- inferred TypeScript type
- task/status enums where needed

Then `packages/contracts/src/index.ts` re-exports them.

## Web Organization

Feature UI should be split into:

```text
components/<Feature>.tsx   Render and user interaction
state/<feature>.ts         API calls and DTO parsing
tests/state/*.test.ts      API behavior
tests/components/*.tsx     UI behavior
```

For source injection, keep prompt formatting in a helper rather than embedding
it directly in a large chat component.

## Naming Conventions

- TypeScript files use kebab-case for feature modules.
- React components use PascalCase filenames.
- Tests mirror source names and end with `.test.ts` or `.test.tsx`.
- SQLite IDs use stable string prefixes where useful, such as `src_` or
  `model_`.
- API route paths use plural nouns: `/api/local-models`,
  `/api/projects/:id/sources`.

## Module Dependencies

Preferred dependency direction:

```text
contracts <- daemon
contracts <- web
platform  <- daemon/web/desktop
daemon    <- packaged
web       <- packaged
```

Avoid importing web code into daemon modules or daemon internals into web state
modules. Use contracts for shared shapes.

## Areas for Review

- Should daemon feature modules move under `src/features/<name>/` as the app
  grows?
- Should route registration be generated from contract definitions?
- Should source extraction be split by file kind into strategy modules?
- Should package boundaries be tightened with dependency linting?

