/**
 * The discovery HTTP surface:
 *   GET  /discovery/resources        - spec filters + offset pagination
 *   GET  /discovery/search           - lexical v1, opaque cursor, honest partialResults
 *   POST /internal/settlement-events - facilitator's SettlementEvent (not public)
 *   POST /federation/register        - independent facilitators join the index
 *   GET  /federation/peers           - transparency: who is registered
 *
 * Wire shapes match the canonical facilitator's bazaar responses and the spec:
 * resources -> {x402Version, items, pagination:{limit,offset,total}}
 * search    -> {x402Version, resources, partialResults, pagination:{limit,cursor}|null}
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Catalog } from './catalog.js';
import type { EmbeddingModel } from './search/embedding-model.js';

const MAX_LIMIT = 100;

function intParam(v: unknown, fallback: number, max: number): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) return fallback;
  return Math.min(n, max);
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset })).toString('base64url');
}

function decodeCursor(cursor: unknown): number {
  if (typeof cursor !== 'string' || cursor.length === 0) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    const o = Number(parsed?.o);
    return Number.isInteger(o) && o >= 0 ? o : 0;
  } catch {
    return 0;
  }
}

const settlementEventSchema = z.object({
  txHash: z.string().min(1),
  network: z.enum(['stellar:testnet', 'stellar:pubnet']),
  scheme: z.string().min(1),
  payTo: z.string().min(1),
  amount: z.string().min(1),
  asset: z.string().min(1),
  resource: z.string(),
  settledAt: z.string().min(1),
  bazaarMetadata: z
    .object({
      type: z.enum(['http', 'mcp']),
      x402Version: z.number().int().min(1),
      description: z.string().optional(),
      mimeType: z.string().optional(),
      serviceName: z.string().optional(),
      tags: z.array(z.string()).optional(),
      iconUrl: z.string().optional(),
      routeTemplate: z.string().optional(),
      toolName: z.string().optional(),
      extensions: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

const federationRegisterSchema = z.object({
  name: z.string().min(1).max(128),
  baseUrl: z.string().url().max(2048),
  catalogUrl: z.string().url().max(2048),
});

export function createRouter(
  catalog: Catalog,
  opts: { ingestToken?: string; embeddingModel: EmbeddingModel },
): Router {
  const router = Router();

  router.get('/discovery/resources', async (req: Request, res: Response) => {
    const limit = intParam(req.query.limit, 20, MAX_LIMIT);
    const offset = intParam(req.query.offset, 0, Number.MAX_SAFE_INTEGER);
    const extensions =
      typeof req.query.extensions === 'string'
        ? req.query.extensions.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
    const { items, total } = await catalog.list({
      type: typeof req.query.type === 'string' ? req.query.type : undefined,
      payTo: typeof req.query.payTo === 'string' ? req.query.payTo : undefined,
      scheme: typeof req.query.scheme === 'string' ? req.query.scheme : undefined,
      network: typeof req.query.network === 'string' ? req.query.network : undefined,
      extensions,
      limit,
      offset,
    });
    res.json({ x402Version: 2, items, pagination: { limit, offset, total } });
  });

  router.get('/discovery/search', async (req: Request, res: Response) => {
    const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
    if (!query) {
      res.status(400).json({
        error: { code: 'payload_invalid', reason: 'query parameter is required' },
      });
      return;
    }
    const limit = intParam(req.query.limit, 20, MAX_LIMIT);
    const offset = decodeCursor(req.query.cursor);
    const { items, total, partialResults } = await catalog.hybridSearch(opts.embeddingModel, query, {
      type: typeof req.query.type === 'string' ? req.query.type : undefined,
      limit,
      offset,
    });
    const nextOffset = offset + items.length;
    res.json({
      x402Version: 2,
      resources: items,
      partialResults,
      pagination: nextOffset < total ? { limit, cursor: encodeCursor(nextOffset) } : null,
    });
  });

  router.post('/internal/settlement-events', async (req: Request, res: Response) => {
    if (opts.ingestToken) {
      const provided = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
      if (provided !== opts.ingestToken) {
        res.status(401).json({ error: { code: 'payload_invalid', reason: 'bad ingest token' } });
        return;
      }
    }
    const parsed = settlementEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'metadata_invalid',
          reason: parsed.error.issues[0]?.message ?? 'invalid event',
        },
      });
      return;
    }
    const event = parsed.data;
    if (!event.bazaarMetadata || !event.resource) {
      // Settlement without discovery metadata: nothing to catalog - acknowledged.
      res.status(202).json({ accepted: true, cataloged: false });
      return;
    }
    const md = event.bazaarMetadata;
    const result = await catalog.add(
      {
        resource: event.resource,
        type: md.type,
        x402Version: md.x402Version,
        accepts: [
          {
            scheme: event.scheme,
            network: event.network,
            payTo: event.payTo,
            asset: event.asset,
            amount: event.amount,
          },
        ],
        description: md.description,
        mimeType: md.mimeType,
        serviceName: md.serviceName,
        tags: md.tags,
        iconUrl: md.iconUrl,
        routeTemplate: md.routeTemplate,
        toolName: md.toolName,
        extensions: md.extensions,
      },
      'observed-settlement',
      event.txHash,
    );
    if (!result.ok) {
      res.status(422).json({ accepted: true, cataloged: false, reason: result.reason });
      return;
    }
    res.status(202).json({ accepted: true, cataloged: true, dropped: result.dropped });
  });

  router.post('/federation/register', async (req: Request, res: Response) => {
    const parsed = federationRegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'payload_invalid',
          reason: parsed.error.issues[0]?.message ?? 'invalid registration',
        },
      });
      return;
    }
    const { name, baseUrl, catalogUrl } = parsed.data;
    await catalog.registerPeer(name, baseUrl, catalogUrl);
    res.status(201).json({ registered: true, name, baseUrl });
  });

  router.get('/federation/peers', async (_req: Request, res: Response) => {
    res.json({ peers: await catalog.peers() });
  });

  router.get('/health', async (_req: Request, res: Response) => {
    res.json({ status: 'ok', resources: await catalog.count() });
  });

  return router;
}
