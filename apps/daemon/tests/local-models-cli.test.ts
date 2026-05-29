import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/cli.ts');

describe('od model CLI', () => {
  let serverProcess: ChildProcess | undefined;
  let serverUrl: string | undefined;
  let tempDir: string | undefined;

  beforeAll(async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'od-model-cli-test-'));
    const serverPath = path.join(tempDir, 'local-model-error-server.mjs');
    writeFileSync(serverPath, `
      import http from 'node:http';

      const server = http.createServer((req, res) => {
        if (req.method === 'PATCH' && req.url === '/api/local-models/missing-model') {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: {
              code: 'LOCAL_MODEL_NOT_FOUND',
              message: 'Local model not found',
              data: { id: 'missing-model' },
            },
          }));
          return;
        }
        if (req.method === 'POST' && req.url === '/api/local-models/diagnostics') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            root: { path: '/models', exists: true, readable: true, message: 'model root is readable' },
            gguf: { path: '/models/GGUF', exists: true, readable: true, message: 'GGUF folder is readable' },
            llamaServer: { command: 'llama-server', available: false, message: 'llama-server was not found on PATH' },
            modelCount: 2,
            checkedAt: 1779757200000,
          }));
          return;
        }
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'UNEXPECTED_TEST_ROUTE' } }));
      });

      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        console.log('READY ' + address.port);
      });
    `);
    serverUrl = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [serverPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      serverProcess = child;
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`server exited early: ${code}`)));
      child.stdout?.on('data', (chunk) => {
        const match = String(chunk).match(/READY (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
    });
  });

  afterAll(() => {
    serverProcess?.kill();
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it('prints help for model commands', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', cliPath, 'model', '--help'], {
      encoding: 'utf8',
      env: { ...process.env, OD_DAEMON_URL: 'http://127.0.0.1:9' },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('od model scan');
    expect(result.stdout).toContain('od model diagnose');
    expect(result.stdout).toContain('od model scorecard');
  });

  it('prints local model diagnostics', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', cliPath, 'model', 'diagnose', '--daemon-url', serverUrl ?? ''],
      {
        encoding: 'utf8',
        env: { ...process.env, OD_DAEMON_URL: serverUrl ?? '' },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('root\tok\tmodel root is readable');
    expect(result.stdout).toContain('models\t2');
    expect(result.stdout).toContain('llama-server\tfail\tllama-server was not found on PATH');
  });

  it('requires a subcommand', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', cliPath, 'model'], {
      encoding: 'utf8',
      env: { ...process.env, OD_DAEMON_URL: 'http://127.0.0.1:9' },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('usage: od model');
  });

  it('handles unknown subcommands as usage errors', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', cliPath, 'model', 'nope'], {
      encoding: 'utf8',
      env: { ...process.env, OD_DAEMON_URL: 'http://127.0.0.1:9' },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown subcommand: od model nope');
    expect(result.stderr).not.toContain('Error:');
    expect(result.stderr).not.toContain('at ');
  });

  it('handles unknown flags as usage errors', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', cliPath, 'model', 'list', '--bogus'], {
      encoding: 'utf8',
      env: { ...process.env, OD_DAEMON_URL: 'http://127.0.0.1:9' },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown flag: --bogus');
    expect(result.stderr).toContain('Usage: od model');
    expect(result.stderr).not.toContain('Error:');
    expect(result.stderr).not.toContain('at parseFlags');
  });

  it('handles daemon-unreachable list failures without raw stack traces', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', cliPath, 'model', 'list'], {
      encoding: 'utf8',
      env: { ...process.env, OD_DAEMON_URL: 'http://127.0.0.1:65534' },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('failed to reach daemon at http://127.0.0.1:65534');
    expect(result.stderr).not.toContain('TypeError: fetch failed');
    expect(result.stderr).not.toContain('at fetch');
  });

  it('preserves local model not found JSON error codes', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        cliPath,
        'model',
        'enable',
        'missing-model',
        '--json',
        '--daemon-url',
        serverUrl ?? '',
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, OD_DAEMON_URL: serverUrl ?? '' },
      },
    );

    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {
        code: 'LOCAL_MODEL_NOT_FOUND',
        message: 'Local model not found',
        data: { id: 'missing-model' },
      },
    });
  });
});
