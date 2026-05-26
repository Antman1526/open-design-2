import type { Express, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import type {
  LocalModelListResponse,
  LocalModelPatchRequest,
  LocalModelPatchResponse,
  LocalModelScanRequest,
  LocalModelScanResponse,
  LocalModelScorecardsResponse,
} from '@open-design/contracts';
import {
  DEFAULT_LOCAL_MODEL_ROOT,
  listLocalModelScorecards,
  listLocalModels,
  scanLocalModels,
  setLocalModelEnabled,
  upsertLocalModels,
} from './local-models.js';

interface RegisterLocalModelRoutesDeps {
  db: Database.Database;
}

interface LocalModelRouteParams {
  id: string;
}

export function registerLocalModelRoutes(app: Express, { db }: RegisterLocalModelRoutesDeps) {
  app.get('/api/local-models', (_req, res: Response<LocalModelListResponse>) => {
    const body: LocalModelListResponse = { models: listLocalModels(db) };
    res.json(body);
  });

  app.post(
    '/api/local-models/scan',
    async (req: Request<unknown, unknown, LocalModelScanRequest>, res: Response) => {
      const root =
        typeof req.body?.root === 'string' && req.body.root.trim().length > 0
          ? req.body.root
          : DEFAULT_LOCAL_MODEL_ROOT;

      try {
        const scannedModels = await scanLocalModels(root);
        upsertLocalModels(db, scannedModels);
        const body: LocalModelScanResponse = {
          root,
          models: listLocalModels(db),
          scannedAt: Date.now(),
        };
        res.json(body);
      } catch (error) {
        res.status(400).json({
          error: {
            code: 'LOCAL_MODEL_SCAN_FAILED',
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    },
  );

  app.patch(
    '/api/local-models/:id',
    (
      req: Request<LocalModelRouteParams, unknown, LocalModelPatchRequest>,
      res: Response,
    ) => {
      if (typeof req.body?.enabled !== 'boolean') {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'enabled must be a boolean',
          },
        });
      }

      const model = setLocalModelEnabled(db, req.params.id, req.body.enabled);
      if (!model) {
        return res.status(404).json({
          error: {
            code: 'LOCAL_MODEL_NOT_FOUND',
            message: 'local model not found',
          },
        });
      }

      const body: LocalModelPatchResponse = { model };
      return res.json(body);
    },
  );

  app.get('/api/local-models/scorecards', (_req, res: Response<LocalModelScorecardsResponse>) => {
    const body: LocalModelScorecardsResponse = { scorecards: listLocalModelScorecards(db) };
    res.json(body);
  });
}
