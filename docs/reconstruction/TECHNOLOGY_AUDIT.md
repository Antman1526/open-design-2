# Technology Audit - Open Design Fork

This audit identifies technologies, frameworks, libraries, tools, languages,
and services used by the project, with their role in this codebase.

## Languages and Runtime

| Technology | Role in this project |
| --- | --- |
| TypeScript | Main implementation language for daemon, web, desktop, tooling, contracts, tests, and package code. |
| JavaScript / ESM | Runtime module format and build output style; used by scripts and generated bundles. |
| Node.js 24.x | Development/runtime engine for daemon, tooling, scripts, tests, and local CLI. |
| HTML/CSS | Generated design artifacts, preview templates, design-system examples, and web UI styling. |
| SQL / SQLite dialect | Database migrations, persistence, scorecards, project records, and source chunks. |
| Shell / zsh/bash | Developer commands, packaging smoke tests, and local wrapper scripts. |

## Package and Build System

| Technology | Role in this project |
| --- | --- |
| pnpm 10.33.2 | Monorepo package manager and workspace runner. |
| Corepack | Ensures the pinned pnpm version is used. |
| TypeScript 5.9.3 | Main compiler version for root, daemon, web, contracts, and most packages. |
| TypeScript 6.0.3 | Compiler used by Electron packaged/desktop tooling packages. |
| tsx 4.22.3 | Runs TypeScript scripts directly in development and guard tooling. |
| esbuild 0.28.0 | Bundles packaged app and selected tools. |
| electron-builder 26.8.1 | Creates macOS DMG/ZIP and other desktop release artifacts. |
| @electron/rebuild 4.0.4 | Rebuilds native dependencies such as `better-sqlite3` for Electron ABI. |
| @electron/notarize 3.1.1 | Optional notarization support for macOS releases. |
| cac 6.7.14 | CLI parser used by packaging tools. |

## Frontend

| Technology | Role in this project |
| --- | --- |
| Next.js 16.2.6 | Web app framework for the design UI. |
| React 18.3.1 | Component model for workspace, settings, source panels, and preview UI. |
| React DOM 18.3.1 | Browser DOM rendering for React. |
| Tailwind CSS 4.3.0 | Utility styling system for web UI. |
| @tailwindcss/postcss 4.3.0 | PostCSS integration for Tailwind. |
| PostCSS 8.5.15 | CSS processing pipeline. |
| lucide-react 1.16.0 | Icon components for controls and settings UI. |
| posthog-js 1.374.2 | Browser telemetry client when enabled. |
| jsdom 29.1.1 | DOM environment for web tests. |
| @testing-library/react 16.3.2 | React component test helpers. |

## Backend / Daemon

| Technology | Role in this project |
| --- | --- |
| Express 5.2.1 | Local daemon HTTP API server. |
| better-sqlite3 12.10.0 | Embedded SQLite persistence for projects, messages, sources, local models, and scorecards. |
| multer 2.1.1 | Multipart upload parsing for project files/sources. |
| undici 7.25.0 | HTTP client for provider calls, local model endpoints, and server checks. |
| chokidar 5.0.0 | Filesystem watching for project/workspace changes. |
| cheerio 1.2.0 | HTML parsing and text extraction support. |
| jszip 3.10.1 | ZIP import/export handling, including Claude Design style imports. |
| tar 7.5.15 | Tar/archive handling in tooling or import/export flows. |
| blake3-wasm 2.1.5 | Fast hashing where content identity/checksums are needed. |
| prom-client 15.1.3 | Prometheus metrics instrumentation. |
| posthog-node 5.34.6 | Server-side telemetry when configured. |
| @opentelemetry/api 1.9.1 | Tracing/instrumentation API surface. |
| @modelcontextprotocol/sdk 1.29.0 | MCP integration support. |

## Desktop and Packaged App

| Technology | Role in this project |
| --- | --- |
| Electron 41.3.0 | Desktop shell and packaged runtime. |
| ELECTRON_RUN_AS_NODE | Required mode for running packaged daemon CLI with Electron ABI-compatible native modules. |
| hdiutil | macOS DMG verification and mounting in smoke tests. |
| macOS Application Support | Packaged writable data location for SQLite and app state. |

## Data and Storage

| Technology | Role in this project |
| --- | --- |
| SQLite | Single-user local app database. |
| Local filesystem | Stores project workspaces, uploaded files, generated artifacts, skills, design systems, and local models. |
| GGUF | Local model file format scanned under `/Users/Antman/Desktop/AI_Models/GGUF`. |
| JSON | API payloads, metadata columns, package manifests, and tool outputs. |
| Markdown | Documentation, skills, design-system definitions, README files, and import packs. |

## AI and Model Integrations

| Technology | Role in this project |
| --- | --- |
| llama.cpp `llama-server` | Managed local GGUF model server launched when no existing endpoint is usable. |
| Ollama OpenAI-compatible API | Local model endpoint at `http://127.0.0.1:11434/v1`. |
| OpenAI-compatible local APIs | First-choice local endpoints at `127.0.0.1:8080/v1` and `127.0.0.1:8000/v1`. |
| OpenAI SDK 6.38.0 | Cloud/OpenAI-compatible provider client usage in web/provider paths. |
| Anthropic SDK 0.32.1 | Anthropic provider support. |
| Azure OpenAI | BYOK provider family supported by proxy/config paths. |
| Google Gemini | BYOK provider family supported by proxy/config paths. |
| SenseAudio | Provider family referenced by proxy and media generation workflows. |
| Coding-agent CLIs | External local agents that can be detected and spawned to generate design artifacts. |

## Document, Media, and Source Processing

| Technology | Role in this project |
| --- | --- |
| Tesseract OCR | Optional local image OCR for project source indexing. |
| PDF/document preview helpers | Extract preview text from PDFs, documents, spreadsheets, and presentations for indexing. |
| MIME metadata | Classifies uploaded files for extraction or metadata-only storage. |
| Image metadata | Stores image dimensions, MIME type, filename, and byte size for design context. |

## Testing and Quality

| Technology | Role in this project |
| --- | --- |
| Vitest 4.1.6 | Unit and integration tests across daemon, web, packages, and tools. |
| Node test runner | Root guard/style workflow tests. |
| TypeScript `--noEmit` | Static type verification. |
| Testing Library | React component behavior tests. |
| Playwright/e2e infrastructure | Browser/Electron validation paths in the repo. |
| Custom `guard` script | Repository policy and style checks. |

## Deployment and Infrastructure

| Technology | Role in this project |
| --- | --- |
| Vercel-compatible web layer | The upstream project supports web deployment paths. |
| Helm chart | Kubernetes deployment metadata exists under chart/tooling directories. |
| Docker-related assets | Infrastructure/deployment support files exist in the broader repo. |
| GitHub | Source control and fork target `Antman1526/open-design-2`. |
| GitHub Actions | CI/release workflow support in the upstream-style repo. |

## Internal Workspace Packages

| Package | Role in this project |
| --- | --- |
| `@open-design/contracts` | Shared Zod API DTOs and TypeScript types. |
| `@open-design/daemon` | Local privileged backend and CLI. |
| `@open-design/web` | Next.js user interface. |
| `@open-design/desktop` | Electron desktop shell. |
| `@open-design/packaged` | Packaged Electron app entry/headless bundle. |
| `@open-design/platform` | Cross-platform helpers. |
| `@open-design/sidecar` | Sidecar runtime support. |
| `@open-design/sidecar-proto` | Sidecar protocol definitions. |
| `@open-design/host` | Host integration utilities. |
| `@open-design/plugin-runtime` | Plugin execution/runtime support. |
| `@open-design/registry-protocol` | Plugin/registry protocol definitions. |
| `@open-design/agui-adapter` | Agent/UI adapter package. |
| `@open-design/tools-dev` | Local dev process orchestrator. |
| `@open-design/tools-pack` | Desktop packaging CLI. |
| `@open-design/tools-serve` | Serving helper tools. |

## Areas for Review

- Which dependencies are unused after the fork-specific local model/source work?
- Should telemetry packages remain enabled for a four-person private test group?
- Should `tesseract` and `llama-server` be packaged or kept as host-installed prerequisites?
- Should infrastructure/deployment assets be trimmed if this fork is desktop-only?

