/**
 * The catalog: PostgreSQL-backed store behind the discovery endpoints.
 *
 * Every entry carries provenance - how it got into the index:
 *   observed-settlement : a payment carrying the bazaar extension settled here
 *   registered          : a seller (or federated facilitator) registered it
 *   ingested            : imported from an external catalog
 *
 * MCP tools are keyed on (resource, toolName) per the Bazaar spec; HTTP
 * resources on (resource, '') - one row per unique key, newest write wins.
 */

import pg from 'pg';
import { cleanEntry, type CleanEntryInput, type CleanResult } from './validation.js';

export type Provenance = 'observed-settlement' | 'registered' | 'ingested';

const SCHEMA = `
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
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  search_tsv TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(service_name,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(array_to_string(tags,' '),'')), 'A') ||
    setweight(to_tsvector('english', coalesce(description,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(resource,'')), 'C')
  ) STORED,
  UNIQUE (resource, tool_name)
);
CREATE INDEX IF NOT EXISTS resources_search_idx ON resources USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS resources_accepts_idx ON resources USING GIN (accepts jsonb_path_ops);
CREATE TABLE IF NOT EXISTS federation_peers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL UNIQUE,
  catalog_url TEXT NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ingested_at TIMESTAMPTZ
);
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
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
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
    await this.pool.query(
      `INSERT INTO resources
        (resource, tool_name, type, x402_version, accepts, description, mime_type,
         service_name, tags, icon_url, route_template, extensions, provenance, source, last_updated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
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
         last_updated = now()`,
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
      ],
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
      params.push(`$.** ? (@ == "${ext.replace(/"/g, '')}")`);
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
   * Lexical search v1 (Postgres FTS, weighted fields) with ILIKE fallback so
   * short/partial queries still return results. Hybrid retrieval per ADR 0002
   * is the funded milestone; this baseline is honest about being lexical.
   */
  async search(
    query: string,
    opts: { type?: string; limit: number; offset: number },
  ): Promise<{ items: unknown[]; total: number }> {
    const params: unknown[] = [query];
    let typeClause = '';
    if (opts.type) {
      params.push(opts.type);
      typeClause = `AND type = $${params.length}`;
    }
    const totalRes = await this.pool.query(
      `SELECT count(*)::int AS n FROM resources
       WHERE (search_tsv @@ websearch_to_tsquery('english', $1)
              OR resource ILIKE '%' || $1 || '%'
              OR service_name ILIKE '%' || $1 || '%') ${typeClause}`,
      params,
    );
    params.push(opts.limit, opts.offset);
    const rows = await this.pool.query(
      `SELECT *,
              ts_rank(search_tsv, websearch_to_tsquery('english', $1)) AS rank
       FROM resources
       WHERE (search_tsv @@ websearch_to_tsquery('english', $1)
              OR resource ILIKE '%' || $1 || '%'
              OR service_name ILIKE '%' || $1 || '%') ${typeClause}
       ORDER BY rank DESC, last_updated DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { items: rows.rows.map(toWire), total: totalRes.rows[0].n };
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

/** Map a DB row to the Bazaar wire shape (DiscoveryResource). */
function toWire(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    resource: row.resource,
    type: row.type,
    x402Version: row.x402_version,
    accepts: row.accepts,
    lastUpdated: row.last_updated,
    metadata: {
      provenance: row.provenance,
      source: row.source ?? undefined,
    },
  };
  if (row.tool_name) out.toolName = row.tool_name;
  if (row.description) out.description = row.description;
  if (row.mime_type) out.mimeType = row.mime_type;
  if (row.service_name) out.serviceName = row.service_name;
  if (row.tags) out.tags = row.tags;
  if (row.icon_url) out.iconUrl = row.icon_url;
  if (row.route_template) out.routeTemplate = row.route_template;
  if (row.extensions) out.extensions = row.extensions;
  return out;
}
