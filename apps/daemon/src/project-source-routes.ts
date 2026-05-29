import type { Express, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import type {
  ProjectSourcesIndexRequest,
  ProjectSourcesIndexResponse,
  ProjectSourcesListResponse,
  ProjectSourcesRetrievalPreviewResponse,
} from '@open-design/contracts';
import type { RouteDeps } from './server-context.js';
import { getProject } from './db.js';
import {
  indexProjectSources,
  listProjectSources,
  retrieveProjectSourceChunks,
} from './project-sources.js';

export interface RegisterProjectSourceRoutesDeps extends RouteDeps<'http' | 'paths'> {
  db: Database.Database;
}

export function registerProjectSourceRoutes(app: Express, ctx: RegisterProjectSourceRoutesDeps) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { PROJECTS_DIR } = ctx.paths;

  app.get('/api/projects/:id/sources', (req, res: Response<ProjectSourcesListResponse>) => {
    const project = getProject(db, req.params.id);
    if (!project) {
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
    }
    return res.json({ sources: listProjectSources(db, req.params.id) });
  });

  app.post(
    '/api/projects/:id/sources/index',
    async (
      req: Request<{ id: string }, unknown, ProjectSourcesIndexRequest>,
      res: Response<ProjectSourcesIndexResponse>,
    ) => {
      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      const paths = Array.isArray(req.body?.paths)
        ? req.body.paths.filter((item: unknown): item is string => typeof item === 'string' && item.length > 0)
        : undefined;
      try {
        const sources = await indexProjectSources(db, PROJECTS_DIR, req.params.id, project.metadata, paths);
        return res.json({ sources, indexedAt: Date.now() });
      } catch (error) {
        return sendApiError(
          res,
          500,
          'INTERNAL_ERROR',
          error instanceof Error ? error.message : 'source indexing failed',
        );
      }
    },
  );

  app.get('/api/projects/:id/sources/retrieval-preview', (req, res: Response<ProjectSourcesRetrievalPreviewResponse>) => {
    const project = getProject(db, req.params.id);
    if (!project) {
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
    }
    const query = typeof req.query.query === 'string' ? req.query.query : '';
    const { chunks, context } = retrieveProjectSourceChunks(db, req.params.id, query);
    return res.json({ query, chunks, context, generatedAt: Date.now() });
  });
}
