import type { Express, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import type {
  LocalModelListResponse,
  LocalModelPatchRequest,
  LocalModelPatchResponse,
  LocalModelDiagnosticsRequest,
  LocalModelDiagnosticsResponse,
  LocalModelTestRequest,
  LocalModelScanRequest,
  LocalModelScanResponse,
  LocalModelScorecardsResponse,
} from '@open-design/contracts';
import { LocalModelDiagnosticsRequestSchema, LocalModelTestRequestSchema } from '@open-design/contracts';
import {
  DEFAULT_LOCAL_MODEL_ROOT,
  diagnoseLocalModelSetup,
  listLocalModelScorecards,
  listLocalModels,
  scanLocalModels,
  setLocalModelEnabled,
  testLocalModel,
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
    '/api/local-models/diagnostics',
    async (
      req: Request<unknown, unknown, LocalModelDiagnosticsRequest>,
      res: Response<LocalModelDiagnosticsResponse | { error: { code: string; message: string } }>,
    ) => {
      const parsed = LocalModelDiagnosticsRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: parsed.error.issues[0]?.message ?? 'invalid local model diagnostics request',
          },
        });
      }
      const result = await diagnoseLocalModelSetup(parsed.data);
      return res.json(result);
    },
  );

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

  app.post(
    '/api/local-models/:id/test',
    async (
      req: Request<LocalModelRouteParams, unknown, LocalModelTestRequest>,
      res: Response,
    ) => {
      const parsed = LocalModelTestRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: parsed.error.issues[0]?.message ?? 'invalid local model test request',
          },
        });
      }

      try {
        const result = await testLocalModel(db, req.params.id, parsed.data);
        if (!result) {
          return res.status(404).json({
            error: {
              code: 'LOCAL_MODEL_NOT_FOUND',
              message: 'local model not found',
            },
          });
        }
        return res.status(result.ok ? 200 : 502).json(result);
      } catch (error) {
        return res.status(500).json({
          error: {
            code: 'LOCAL_MODEL_TEST_FAILED',
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    },
  );
}
