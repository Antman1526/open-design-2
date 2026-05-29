import { afterEach, describe, expect, it, vi } from 'vitest';

import { historyWithApiAttachmentContext } from '../src/api-attachment-context';
import {
  fetchProjectFilePreview,
  fetchProjectFileText,
} from '../src/providers/registry';
import { previewProjectSourceRetrieval } from '../src/state/project-sources';
import type { ChatMessage, ProjectFile } from '../src/types';

vi.mock('../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../src/providers/registry')>(
    '../src/providers/registry',
  );
  return {
    ...actual,
    fetchProjectFilePreview: vi.fn().mockResolvedValue(null),
    fetchProjectFileText: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('../src/state/project-sources', () => ({
  previewProjectSourceRetrieval: vi.fn().mockResolvedValue({
    query: '',
    chunks: [],
    context: '',
    generatedAt: 1,
  }),
}));

const mockedFetchProjectFilePreview = vi.mocked(fetchProjectFilePreview);
const mockedFetchProjectFileText = vi.mocked(fetchProjectFileText);
const mockedPreviewProjectSourceRetrieval = vi.mocked(previewProjectSourceRetrieval);

describe('historyWithApiAttachmentContext', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('adds extracted document previews to the target user message', async () => {
    mockedFetchProjectFilePreview.mockResolvedValue({
      kind: 'document',
      title: 'brief.docx',
      sections: [{ title: 'Document', lines: ['Hello world', 'Second line'] }],
    });

    const history = await historyWithApiAttachmentContext(
      [userMessage('msg-1', 'Summarize this', [{ path: 'brief.docx', name: 'brief.docx', kind: 'file' }])],
      'msg-1',
      'project-1',
      [projectFile('brief.docx', 'document')],
    );

    expect(mockedFetchProjectFilePreview).toHaveBeenCalledWith('project-1', 'brief.docx');
    expect(mockedPreviewProjectSourceRetrieval).toHaveBeenCalledWith('project-1', 'Summarize this');
    expect(history[0]?.content).toContain('<attached-project-files>');
    expect(history[0]?.content).toContain('Hello world');
    expect(history[0]?.content).toContain('Second line');
  });

  it('reads raw text attachments with a cache buster from file metadata', async () => {
    mockedFetchProjectFileText.mockResolvedValue('const answer = 42;');

    const history = await historyWithApiAttachmentContext(
      [userMessage('msg-1', 'Use this code', [{ path: 'src/demo.ts', name: 'demo.ts', kind: 'file' }])],
      'msg-1',
      'project-1',
      [projectFile('src/demo.ts', 'code')],
    );

    expect(mockedFetchProjectFileText).toHaveBeenCalledWith(
      'project-1',
      'src/demo.ts',
      { cache: 'no-store', cacheBustKey: 123 },
    );
    expect(history[0]?.content).toContain('```ts');
    expect(history[0]?.content).toContain('const answer = 42;');
  });

  it('does not fetch raw text for sketch image attachments', async () => {
    const history = await historyWithApiAttachmentContext(
      [userMessage('msg-1', 'Use this sketch', [{ path: 'sketch-board.png', name: 'sketch-board.png', kind: 'image' }])],
      'msg-1',
      'project-1',
      [projectFile('sketch-board.png', 'sketch')],
    );

    expect(mockedFetchProjectFileText).not.toHaveBeenCalled();
    expect(mockedFetchProjectFilePreview).not.toHaveBeenCalled();
    expect(history[0]?.content).toContain('kind: sketch');
    expect(history[0]?.content).toContain('Content preview unavailable');
  });

  it('uses filename inference when the project file list has not refreshed yet', async () => {
    mockedFetchProjectFilePreview.mockResolvedValue({
      kind: 'pdf',
      title: 'report.pdf',
      sections: [{ title: 'PDF', lines: ['Quarterly results'] }],
    });

    const history = await historyWithApiAttachmentContext(
      [userMessage('msg-1', 'Read this', [{ path: 'report.pdf', name: 'report.pdf', kind: 'file' }])],
      'msg-1',
      'project-1',
      [],
    );

    expect(mockedFetchProjectFilePreview).toHaveBeenCalledWith('project-1', 'report.pdf');
    expect(history[0]?.content).toContain('Quarterly results');
  });

  it('adds indexed source context even without direct attachments', async () => {
    mockedPreviewProjectSourceRetrieval.mockResolvedValue({
      query: 'Use the brand brief',
      chunks: [],
      context: '<uploaded-project-sources>Brand green</uploaded-project-sources>',
      generatedAt: 1,
    });

    const history = await historyWithApiAttachmentContext(
      [userMessage('msg-1', 'Use the brand brief', [])],
      'msg-1',
      'project-1',
      [],
    );

    expect(history[0]?.content).toContain('<uploaded-project-sources>');
    expect(history[0]?.content).toContain('Brand green');
  });

  it('does not fetch indexed sources when project source injection is disabled', async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
    storage.set('open-design.projectSources.project-1.enabled', 'false');

    const history = await historyWithApiAttachmentContext(
      [userMessage('msg-1', 'Use the brand brief', [])],
      'msg-1',
      'project-1',
      [],
    );

    expect(mockedPreviewProjectSourceRetrieval).not.toHaveBeenCalled();
    expect(history[0]?.content).toBe('Use the brand brief');
  });
});

function userMessage(
  id: string,
  content: string,
  attachments: NonNullable<ChatMessage['attachments']>,
): ChatMessage {
  return {
    id,
    role: 'user',
    content,
    createdAt: 1,
    attachments,
  };
}

function projectFile(path: string, kind: ProjectFile['kind']): ProjectFile {
  return {
    name: path.split('/').pop() ?? path,
    path,
    type: 'file',
    size: 100,
    mtime: 123,
    kind,
    mime: 'application/octet-stream',
  };
}
