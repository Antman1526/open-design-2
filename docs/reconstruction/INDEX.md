# Open Design Reconstruction Documentation Index

This folder is a reconstruction-oriented technical documentation set for the
`Antman1526/open-design-2` fork of Open Design. It describes the project as a
local-first design tool with a Next.js web UI, a Node/Electron daemon, a
packaged Electron desktop shell, a SQLite persistence layer, coding-agent
adapters, local LLM discovery/testing, and durable project source indexing.

The docs are written for another AI system or senior engineer that needs enough
context to reason about the codebase, recreate the application, identify
technical debt, and implement further improvements without access to tribal
knowledge.

## Documents

1. [Project Overview & Architecture](01-project-overview-architecture.md)
2. [Environment Setup & Dependencies](02-environment-setup-dependencies.md)
3. [Database Schema & Data Models](03-database-schema-data-models.md)
4. [Backend API Specifications](04-backend-api-specifications.md)
5. [Frontend Architecture & Components](05-frontend-architecture-components.md)
6. [Authentication & Authorization System](06-authentication-authorization.md)
7. [Business Logic & Core Algorithms](07-business-logic-core-algorithms.md)
8. [Integration Points & External Services](08-integration-points-external-services.md)
9. [Configuration & Environment Variables](09-configuration-environment-variables.md)
10. [Testing Strategy & Test Cases](10-testing-strategy-test-cases.md)
11. [Build & Deployment Pipeline](11-build-deployment-pipeline.md)
12. [Error Handling & Logging](12-error-handling-logging.md)
13. [Performance Optimization & Caching](13-performance-caching.md)
14. [Security Implementation & Best Practices](14-security-best-practices.md)
15. [File Structure & Code Organization](15-file-structure-code-organization.md)

Related audit:

- [Technology Audit](TECHNOLOGY_AUDIT.md)

## Canonical Local Paths

- Repository: `/Users/Antman/Desktop/OpenDesign/open-design-2`
- Desktop artifact folder: `/Users/Antman/Desktop/OpenDesign`
- Local model root: `/Users/Antman/Desktop/AI_Models`
- GGUF model folder: `/Users/Antman/Desktop/AI_Models/GGUF`
- Packaged macOS app data: `~/Library/Application Support/Open Design/namespaces/default/data`
- Development data default: `<repo>/.od`

## Current Reconstruction Focus

The most important fork-specific additions documented here are:

- Uploading documents, source files, PDFs, spreadsheets, presentations, and
  images as first-class project sources.
- Indexing source metadata and retrievable text chunks in SQLite.
- Injecting retrieved source chunks into design prompts under an explicit
  untrusted-reference boundary.
- Discovering, testing, scoring, and routing local LLMs from
  `/Users/Antman/Desktop/AI_Models`.
- Auto-hybrid local runner behavior: existing OpenAI-compatible endpoints,
  existing Ollama endpoint, then managed `llama-server` for GGUF models.
- Packaged daemon CLI smoke workflow using `ELECTRON_RUN_AS_NODE=1` with the
  packaged app binary, not Homebrew Node.

