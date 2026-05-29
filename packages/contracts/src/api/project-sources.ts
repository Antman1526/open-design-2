import { z } from 'zod';

export const ProjectSourceKindSchema = z.enum([
  'text',
  'code',
  'html',
  'pdf',
  'document',
  'presentation',
  'spreadsheet',
  'image',
  'binary',
]);

export type ProjectSourceKind = z.infer<typeof ProjectSourceKindSchema>;

export const ProjectSourceStatusSchema = z.enum([
  'pending',
  'indexed',
  'metadata_only',
  'unsupported',
  'error',
]);

export type ProjectSourceStatus = z.infer<typeof ProjectSourceStatusSchema>;

export const ProjectSourceSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  path: z.string().min(1),
  name: z.string().min(1),
  kind: ProjectSourceKindSchema,
  mime: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  status: ProjectSourceStatusSchema,
  summary: z.string(),
  error: z.string().optional(),
  chunkCount: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type ProjectSource = z.infer<typeof ProjectSourceSchema>;

export const ProjectSourceChunkSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  projectId: z.string().min(1),
  path: z.string().min(1),
  chunkIndex: z.number().int().nonnegative(),
  kind: z.string().min(1),
  text: z.string(),
  charCount: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
});

export type ProjectSourceChunk = z.infer<typeof ProjectSourceChunkSchema>;

export interface ProjectSourcesListResponse {
  sources: ProjectSource[];
}

export interface ProjectSourcesIndexRequest {
  paths?: string[];
}

export interface ProjectSourcesIndexResponse {
  sources: ProjectSource[];
  indexedAt: number;
}

export interface ProjectSourcesRetrievalPreviewResponse {
  query: string;
  chunks: ProjectSourceChunk[];
  context: string;
  generatedAt: number;
}
