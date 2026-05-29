import { mkdir, writeFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateProjectSources, indexProjectSources, retrieveProjectSourceChunks } from '../src/project-sources.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'od-project-sources-'));
  tempDirs.push(dir);
  return dir;
}

describe('project sources', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('indexes text files and renders retrieval context as untrusted material', async () => {
    const db = new Database(':memory:');
    migrateProjectSources(db);
    const projectsRoot = makeTempDir();
    const projectId = 'project-a';
    await mkdir(path.join(projectsRoot, projectId), { recursive: true });
    await writeFile(path.join(projectsRoot, projectId, 'brief.md'), '# Brand\nUse green accents.');

    const sources = await indexProjectSources(db, projectsRoot, projectId, null);
    const preview = retrieveProjectSourceChunks(db, projectId, 'green');

    expect(sources).toHaveLength(1);
    expect(sources[0]?.status).toBe('indexed');
    expect(preview.chunks[0]?.path).toBe('brief.md');
    expect(preview.context).toContain('untrusted reference material');
    expect(preview.context).toContain('Use green accents.');
    db.close();
  });

  it('skips generated and dependency folders while indexing project sources', async () => {
    const db = new Database(':memory:');
    migrateProjectSources(db);
    const projectsRoot = makeTempDir();
    const projectId = 'project-a';
    await mkdir(path.join(projectsRoot, projectId, 'node_modules/pkg'), { recursive: true });
    await mkdir(path.join(projectsRoot, projectId, 'dist'), { recursive: true });
    await writeFile(path.join(projectsRoot, projectId, 'brief.md'), '# Brand\nUse green accents.');
    await writeFile(path.join(projectsRoot, projectId, 'node_modules/pkg/readme.md'), 'dependency text');
    await writeFile(path.join(projectsRoot, projectId, 'dist/bundle.js'), 'generated text');

    const sources = await indexProjectSources(db, projectsRoot, projectId, null);
    const paths = sources.map((source) => source.path);

    expect(paths).toEqual(['brief.md']);
    db.close();
  });
});
