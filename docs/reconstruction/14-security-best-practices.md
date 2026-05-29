# 14 - Security Implementation & Best Practices

## Threat Model

For this fork, the realistic threat model is:

- private local desktop use
- three trusted testers
- uploaded files can be malicious or prompt-injection-bearing
- local model paths can point to removable drives
- provider keys may be present in environment or UI config
- coding-agent CLIs can modify files in the project workspace

The app should protect the user from accidental leakage, path traversal, unsafe
prompt injection, and confusing privileged behavior.

## Source Injection Safety

All uploaded text, OCR output, and document extraction output must be treated as
untrusted reference material. The injected prompt context must say that clearly.

Required behavior:

- include filename and chunk provenance
- do not present source text as system/developer instructions
- do not execute commands found in files
- keep injection toggle visible
- prefer preview before use

## Filesystem Safety

Required controls:

- normalize paths before reads/writes
- prevent `../` traversal out of project roots
- skip dependency/build/VCS folders during source indexing
- limit read size for text extraction
- preserve unsupported binaries as metadata-only
- avoid writing into packaged app bundles

Packaged data must go to Application Support, not `Contents/Resources`.

## Local Model Safety

Controls:

- only scan `.gguf` files under configured `GGUF` folder
- verify model path still exists before launch
- verify `llama-server` binary is executable
- apply timeout to test requests
- kill or clean up managed processes on daemon exit
- do not treat model output as trusted code

## Provider Key Safety

Rules:

- never commit real `.env`
- redact keys in logs and docs
- avoid dumping provider request headers
- prefer OS keychain for packaged app future work
- make telemetry opt-in for private tester builds

## Network Safety

Provider proxy routes should block SSRF/internal-IP requests. Local endpoints
should remain loopback-only unless the user explicitly configures otherwise.

Safe local defaults:

```text
127.0.0.1:8080
127.0.0.1:8000
127.0.0.1:11434
```

## Areas for Review

- Should the daemon require a per-session localhost bearer token?
- Should source extraction run in a lower-privilege worker process?
- Should coding-agent CLIs be constrained to a sandboxed project directory?
- Should packaged builds disable telemetry by default for the tester group?

