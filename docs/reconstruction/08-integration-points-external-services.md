# 08 - Integration Points & External Services

## Local Integrations

### Coding-Agent CLIs

Open Design can delegate design work to installed coding-agent CLIs on the
user's PATH. These agents operate in the project folder and can read/write
files. The daemon is responsible for detecting, spawning, streaming, and
interrupting these processes.

Relevant behavior:

- auto-detect installed CLIs
- choose adapter by selected runtime
- handle long prompts with stdin or prompt-file fallbacks
- stream tool calls/todos/messages back to the UI
- keep generated files in the project workspace

### Local OpenAI-Compatible Servers

The local model runner first attempts OpenAI-compatible endpoints:

```text
http://127.0.0.1:8080/v1
http://127.0.0.1:8000/v1
```

Expected chat completion shape:

```http
POST /chat/completions
Content-Type: application/json

{
  "model": "local-model-name",
  "messages": [
    { "role": "user", "content": "Test prompt" }
  ],
  "stream": false
}
```

### Ollama

Ollama is used through its OpenAI-compatible endpoint:

```text
http://127.0.0.1:11434/v1
```

This lets routing share request code with other OpenAI-compatible local servers.

### Managed `llama-server`

When no existing endpoint works, the daemon can launch:

```bash
llama-server -m /Users/Antman/Desktop/AI_Models/GGUF/model.gguf --port <port>
```

The binary may be found on PATH or configured explicitly. The runner retries
ports and records `serverMode: "llama-server"` in run history.

### OCR

Image OCR is optional and best-effort. If `tesseract` is present, image text can
be extracted into source chunks. If not, image sources remain metadata-only.

## Cloud Provider Integrations

The app supports BYOK provider proxy routes for hosted model APIs. The README
and codebase reference provider families including:

- Anthropic
- OpenAI
- Azure OpenAI
- Google Gemini
- Ollama Cloud
- SenseAudio

The daemon should normalize provider streams into the app's chat/design event
format and block internal-IP/SSRF behavior at the proxy boundary.

## Telemetry Integrations

Telemetry libraries are present:

- `posthog-node` in the daemon
- `posthog-js` in the web UI
- `@opentelemetry/api` in the daemon
- `prom-client` for metrics

For a private fork, telemetry should be opt-in or disabled by default unless
explicitly configured.

## Desktop Sidecar Integration

Electron and sidecar packages allow the desktop shell to:

- host or connect to the web UI
- start/check daemon status
- evaluate UI state in tests
- capture screenshots
- pass IPC messages for desktop-specific behavior

Packaged smoke tests should launch the app bundle and test daemon behavior from
the installed runtime.

## File and Archive Integrations

The daemon uses:

- `multer` for multipart uploads
- `jszip` for ZIP import/export
- `tar` for archive workflows
- document preview helpers for PDFs and office-like files

All extracted content must be treated as untrusted input.

## Areas for Review

- Should local endpoint detection be user-visible with clear precedence?
- Should provider proxy integrations share one streaming abstraction?
- Should telemetry be fully disabled in private tester builds?
- Should OCR/captioning use a local vision model from `/Users/Antman/Desktop/AI_Models` when available?

