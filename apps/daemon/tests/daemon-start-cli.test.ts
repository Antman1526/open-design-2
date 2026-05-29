import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/cli.ts');

describe('od daemon start CLI', () => {
  let child: ChildProcess | undefined;

  afterEach(() => {
    child?.kill('SIGTERM');
    child = undefined;
  });

  it('keeps the headless daemon process alive after printing the listening URL', async () => {
    child = spawn(process.execPath, [
      '--import',
      'tsx',
      cliPath,
      'daemon',
      'start',
      '--headless',
      '--port',
      '0',
      '--no-open',
    ], {
      env: { ...process.env, OD_DATA_DIR: path.join(process.cwd(), '.tmp', 'daemon-start-cli-test') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const line = await waitForListeningLine(child);
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(line).toContain('[od] listening on http://127.0.0.1:');
    expect(child.exitCode).toBeNull();
  });
});

function waitForListeningLine(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      reject(new Error(`timed out waiting for daemon start\nstdout=${stdout}\nstderr=${stderr}`));
    }, 15_000);
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
      const line = stdout.split(/\r?\n/).find((item) => item.includes('[od] listening on '));
      if (line) {
        clearTimeout(timer);
        resolve(line);
      }
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`daemon exited before listening: code=${code} signal=${signal}\nstdout=${stdout}\nstderr=${stderr}`));
    });
    child.once('error', reject);
  });
}
