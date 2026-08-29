/**
 * The catalog: PostgreSQL-backed store behind the discovery endpoints.
 *
 * Every entry carries provenance - how it got into the index:
 *   observed-settlement : a payment carrying the bazaar extension settled here
 *   registered          : a seller (or federated facilitator) registered it
 *   ingested            : imported from an external catalog
 *
 * MCP tools are keyed on (resource, toolName) per the Bazaar spec; HTTP
 * resources on (resource, '') - one row per unique key, newest write wins
 * until the row is ownership-bound: the first observed-settlement write
 * binds the row to its payTo, and later writes with a different payTo are
 * refused (migrations/0004_ownership_binding.sql, threat-model §3).
 */

import pg from 'pg';
import pgvector from 'pgvector/pg';
import { cleanEntry, type CleanEntryInput, type CleanResult } from './validation.js';
import { lexicalSearch } from './search/lexical.js';
import { hybridSearch, type HybridSearchResult } from './search/hybrid.js';
import { denseSearch } from './search/dense.js';
import type { EmbeddingModel } from './search/embedding-model.js';
import { toWire } from './wire.js';

export type Provenance = 'observed-settlement' | 'registered' | 'ingested';

const SCHEMA = `
-- also bootstrapped on its own connection in connect() below, before this
-- pool exists - repeated here so SCHEMA alone still documents the full
-- picture of what this service depends on.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS resources (
  id BIGSERIAL PRIMARY KEY,
  resource TEXT NOT NULL,
  tool_name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('http','mcp')),
  x402_version INT NOT NULL,
  accepts JSONB NOT NULL,
  description TEXT,
  mime_type TEXT,
  service_name TEXT,
  tags TEXT[],
  icon_url TEXT,
  route_template TEXT,
  extensions JSONB,
  provenance TEXT NOT NULL CHECK (provenance IN ('observed-settlement','registered','ingested')),
  source TEXT,
  settlement_count INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- app-computed search fields: generated columns may only use IMMUTABLE
  -- functions (array_to_string is not), so the app flattens tags at write time
  search_a TEXT NOT NULL DEFAULT '',
  search_b TEXT NOT NULL DEFAULT '',
  search_c TEXT NOT NULL DEFAULT '',
  search_tsv TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', search_a), 'A') ||
    setweight(to_tsvector('english', search_b), 'B') ||
    setweight(to_tsvector('english', search_c), 'C')
  ) STORED,
  UNIQUE (resource, tool_name)
);
CREATE INDEX IF NOT EXISTS resources_search_idx ON resources USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS resources_accepts_idx ON resources USING GIN (accepts jsonb_path_ops);
-- migrations/0001_settlement_count.sql - CREATE TABLE IF NOT EXISTS above only
-- covers a fresh database; this brings an existing one forward the same way
-- every other schema change here has been applied, idempotently on connect.
ALTER TABLE resources ADD COLUMN IF NOT EXISTS settlement_count INTEGER NOT NULL DEFAULT 0;
-- migrations/0004_ownership_binding.sql
ALTER TABLE resources ADD COLUMN IF NOT EXISTS bound_pay_to TEXT;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS bound_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS federation_peers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL UNIQUE,
  catalog_url TEXT NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ingested_at TIMESTAMPTZ
);
-- migrations/0002_dense_retrieval.sql
CREATE TABLE IF NOT EXISTS generations (
  id BIGSERIAL PRIMARY KEY,
  model_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  pooling TEXT NOT NULL,
  normalization TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_id, revision, dimension, pooling, normalization)
);
CREATE TABLE IF NOT EXISTS embedding_jobs (
  id BIGSERIAL PRIMARY KEY,
  resource_id BIGINT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS embedding_jobs_claim_idx ON embedding_jobs (status, next_attempt_at);
CREATE UNIQUE INDEX IF NOT EXISTS embedding_jobs_live_resource_idx
  ON embedding_jobs (resource_id) WHERE status IN ('pending', 'processing');
-- vector, not vector(n): this table holds every generation's vectors side
-- by side (old + new during a model swap), and pgvector's fixed-width
-- vector(n) can't hold more than one dimension. Every real query scopes by
-- generation_id first (search/dense.ts), so any two vectors actually
-- compared always share a dimension by construction - see
-- migrations/0003_pgvector.sql for the full reasoning.
CREATE TABLE IF NOT EXISTS embeddings (
  id BIGSERIAL PRIMARY KEY,
  resource_id BIGINT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  generation_id BIGINT NOT NULL REFERENCES generations(id),
  kind TEXT NOT NULL CHECK (kind IN ('resource', 'synthetic_query')),
  text TEXT NOT NULL,
  vector vector NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS embeddings_generation_idx ON embeddings (generation_id);
CREATE INDEX IF NOT EXISTS embeddings_resource_idx ON embeddings (resource_id);
-- migrations/0003_pgvector.sql: upgrades an existing double precision[] column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'embeddings' AND column_name = 'vector' AND data_type = 'ARRAY'
  ) THEN
    ALTER TABLE embeddings ALTER COLUMN vector TYPE vector USING vector::real[]::vector;
  END IF;
END $$;
`;

export interface ListFilters {
  type?: string;
  payTo?: string;
  scheme?: string;
  network?: string;
  extensions?: string[];
  limit: number;
  offset: number;
}

export class Catalog {
  constructor(private readonly pool: pg.Pool) {}

  static async connect(databaseUrl: string): Promise<Catalog> {
    // Bootstrap the extension on its own connection, before the pool
    // exists: the pool's onConnect hook below (which registers pgvector's
    // types) needs CREATE EXTENSION to have already run, or its very first
    // connection fails to find the type - and since a pooled connection is
    // reused for later queries without onConnect firing again, that one
    // connection would silently never get vector types registered even
    // after SCHEMA creates the extension moments later.
    const bootstrap = new pg.Client({ connectionString: databaseUrl });
    await bootstrap.connect();
    await bootstrap.query('CREATE EXTENSION IF NOT EXISTS vector');
    await bootstrap.end();

    const pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 10,
      // pgvector needs its types registered per physical connection (it
      // looks up the extension's type OIDs, which are per-session) so
      // reading an `embeddings.vector` column back gives a plain number[],
      // not the raw wire text.
      onConnect: async (client) => {
        await pgvector.registerTypes(client);
      },
    });
    await pool.query(SCHEMA);
    return new Catalog(pool);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  /** Validate + upsert. Returns the gauntlet result so callers can report outcomes. */
  async add(
    input: CleanEntryInput,
    provenance: Provenance,
    source: string | null,
  ): Promise<CleanResult> {
    const result = cleanEntry(input);
    if (!result.ok) return result;
    const e = result.entry;
    const searchA = [e.serviceName ?? '', ...(e.tags ?? [])].join(' ').trim();
    const searchB = e.description ?? '';
    const searchC = e.resource;
    const settlementDelta = provenance === 'observed-settlement' ? 1 : 0;
    const acceptPayTos = (e.accepts as Array<Record<string, unknown>>)
      .map((a) => a?.payTo)
      .filter((p): p is string => typeof p === 'string' && p.length > 0);
    const bindingPayTo = settlementDelta === 1 ? (acceptPayTos[0] ?? null) : null;
    const inserted = await this.pool.query<{ id: number }>(
      `INSERT INTO resources
        (resource, tool_name, type, x402_version, accepts, description, mime_type,
         service_name, tags, icon_url, route_template, extensions, provenance, source,
         search_a, search_b, search_c, settlement_count, last_updated, bound_pay_to, bound_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, $18, now(),
         $19, CASE WHEN $19::text IS NULL THEN NULL ELSE now() END)
       ON CONFLICT (resource, tool_name) DO UPDATE SET
         type = EXCLUDED.type,
         x402_version = EXCLUDED.x402_version,
         accepts = EXCLUDED.accepts,
         description = EXCLUDED.description,
         mime_type = EXCLUDED.mime_type,
         service_name = EXCLUDED.service_name,
         tags = EXCLUDED.tags,
         icon_url = EXCLUDED.icon_url,
         route_template = EXCLUDED.route_template,
         extensions = EXCLUDED.extensions,
         search_a = EXCLUDED.search_a,
         search_b = EXCLUDED.search_b,
         search_c = EXCLUDED.search_c,
         -- atomic increment (not read-then-write): Postgres serializes
         -- concurrent ON CONFLICT DO UPDATE on the same conflict key via the
         -- row's lock, so two racing settlements for the same resource each
         -- see the other's committed increment, never lose one.
         settlement_count = resources.settlement_count + $18,
         last_updated = now(),
         provenance = CASE WHEN $19::text IS NOT NULL THEN 'observed-settlement' ELSE resources.provenance END,
         source = CASE WHEN $19::text IS NOT NULL THEN EXCLUDED.source ELSE resources.source END,
         bound_pay_to = COALESCE(resources.bound_pay_to, $19),
         bound_at = CASE WHEN resources.bound_pay_to IS NULL AND $19::text IS NOT NULL THEN now() ELSE resources.bound_at END
       WHERE resources.bound_pay_to IS NULL
          OR (cardinality($20::text[]) > 0 AND resources.bound_pay_to = ALL($20::text[]))
       RETURNING id`,
      [
        e.resource,
        e.toolName ?? '',
        e.type,
        e.x402Version,
        JSON.stringify(e.accepts),
        e.description ?? null,
        e.mimeType ?? null,
        e.serviceName ?? null,
        e.tags ?? null,
        e.iconUrl ?? null,
        e.routeTemplate ?? null,
        e.extensions ? JSON.stringify(e.extensions) : null,
        provenance,
        source,
        searchA,
        searchB,
        searchC,
        settlementDelta,
        bindingPayTo,
        acceptPayTos,
      ],
    );
    if (inserted.rows.length === 0) {
      return { ok: false, reason: 'ownership_conflict' };
    }
    const resourceId = inserted.rows[0].id;
    // Embed asynchronously (stage 2): enqueue, don't block cataloging on it.
    // The partial-unique-index conflict target means a resource that
    // already has a live (pending/processing) job doesn't get a second one
    // queued behind it on every repeat settlement.
    await this.pool.query(
      `INSERT INTO embedding_jobs (resource_id)
       VALUES ($1)
       ON CONFLICT (resource_id) WHERE status IN ('pending', 'processing') DO NOTHING`,
      [resourceId],
    );
    return result;
  }

  private filterClauses(f: ListFilters, params: unknown[]): string {
    const where: string[] = [];
    if (f.type) {
      params.push(f.type);
      where.push(`type = $${params.length}`);
    }
    if (f.payTo) {
      params.push(JSON.stringify([{ payTo: f.payTo }]));
      where.push(`accepts @> $${params.length}::jsonb`);
    }
    if (f.scheme) {
      params.push(JSON.stringify([{ scheme: f.scheme }]));
      where.push(`accepts @> $${params.length}::jsonb`);
    }
    if (f.network) {
      params.push(JSON.stringify([{ network: f.network }]));
      where.push(`accepts @> $${params.length}::jsonb`);
    }
    for (const ext of f.extensions ?? []) {
      // JSON.stringify produces a correctly-escaped jsonpath string literal
      // (jsonpath string escaping matches JSON's) - a hand-rolled "strip
      // quotes only" version left backslashes unescaped, so a trailing `\`
      // in the query string produced an unterminated-string jsonpath parse
      // error (a live, reproduced 500 with a stack trace in the response -
      // see docs/threat-model.md's finding on this).
      params.push(`$.** ? (@ == ${JSON.stringify(ext)})`);
      where.push(`extensions IS NOT NULL AND jsonb_path_exists(extensions, $${params.length}::jsonpath)`);
    }
    return where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  }

  async list(f: ListFilters): Promise<{ items: unknown[]; total: number }> {
    const params: unknown[] = [];
    const where = this.filterClauses(f, params);
    const totalRes = await this.pool.query(
      `SELECT count(*)::int AS n FROM resources ${where}`,
      params,
    );
    params.push(f.limit, f.offset);
    const rows = await this.pool.query(
      `SELECT * FROM resources ${where}
       ORDER BY last_updated DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { items: rows.rows.map(toWire), total: totalRes.rows[0].n };
  }

  /**
   * Lexical search: real BM25F ranking (search/bm25.ts, search/lexical.ts),
   * not Postgres's ts_rank. Candidate selection (FTS tsquery OR the ILIKE
   * fallback for short/partial queries) is unchanged from v1.
   */
  async search(
    query: string,
    opts: { type?: string; limit: number; offset: number },
  ): Promise<{ items: unknown[]; total: number }> {
    return lexicalSearch(this.pool, query, opts);
  }

  /**
   * The full pipeline behind GET /discovery/search (stage 3): structured
   * constraints, BM25 + dense fusion, settlement-history tiebreak. `search()`
   * above (BM25-only) stays as its own entrypoint for eval-harness's
   * lexical-only configuration.
   */
  async hybridSearch(
    model: EmbeddingModel,
    query: string,
    opts: { type?: string; limit: number; offset: number },
  ): Promise<HybridSearchResult> {
    return hybridSearch(this.pool, model, query, opts);
  }

  /** Dense-only search, paginated and wire-mapped - symmetric with search() (BM25-only); eval-harness's "dense-only" configuration uses this directly. */
  async denseOnlySearch(
    model: EmbeddingModel,
    query: string,
    opts: { limit: number; offset: number },
  ): Promise<{ items: unknown[]; total: number }> {
    const candidates = await denseSearch(this.pool, model, query);
    const ids = candidates.slice(opts.offset, opts.offset + opts.limit).map((c) => c.resourceId);
    if (ids.length === 0) return { items: [], total: candidates.length };
    const rows = await this.pool.query('SELECT * FROM resources WHERE id = ANY($1::bigint[])', [ids]);
    const byId = new Map(rows.rows.map((r) => [r.id as number, r]));
    const items = ids.map((id) => toWire(byId.get(id)!)).filter(Boolean);
    return { items, total: candidates.length };
  }

  /**
   * Single-resource lookup for GET /discovery/resource. Rows key on
   * (resource, tool_name) - HTTP resources live at tool_name = '' (see the
   * module docstring), so an MCP resource exposing multiple tools needs
   * `toolName` to disambiguate; omitting it only ever matches the HTTP row.
   */
  async getByResource(resource: string, toolName?: string): Promise<unknown | null> {
    const params: unknown[] = [resource, toolName ?? ''];
    const res = await this.pool.query(
      'SELECT * FROM resources WHERE resource = $1 AND tool_name = $2',
      params,
    );
    return res.rows[0] ? toWire(res.rows[0]) : null;
  }

  async registerPeer(name: string, baseUrl: string, catalogUrl: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO federation_peers (name, base_url, catalog_url)
       VALUES ($1,$2,$3)
       ON CONFLICT (base_url) DO UPDATE SET name = EXCLUDED.name, catalog_url = EXCLUDED.catalog_url`,
      [name, baseUrl, catalogUrl],
    );
  }

  async peers(): Promise<{ name: string; base_url: string; catalog_url: string }[]> {
    const res = await this.pool.query(
      'SELECT name, base_url, catalog_url FROM federation_peers ORDER BY registered_at',
    );
    return res.rows;
  }

  async markPeerIngested(baseUrl: string): Promise<void> {
    await this.pool.query(
      'UPDATE federation_peers SET last_ingested_at = now() WHERE base_url = $1',
      [baseUrl],
    );
  }

  async count(): Promise<number> {
    const res = await this.pool.query('SELECT count(*)::int AS n FROM resources');
    return res.rows[0].n;
  }
}

