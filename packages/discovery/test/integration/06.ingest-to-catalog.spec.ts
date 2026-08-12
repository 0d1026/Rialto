import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Catalog } from '../../src/catalog.js';
import { createApp } from '../../src/app.js';
import { resetDb, testDatabaseUrl } from '../setup/db.js';
import { VALID_EVENT } from '../fixtures/settlement-events.js';

/**
 * The cross-team contract point: facilitator -> discovery. Full loop
 * against a real Postgres instance, no mocking of the database layer.
 * POST /internal/settlement-events with a valid event, then confirm the row
 * exists via a direct repository query - not just an HTTP 202, an actual row.
 *
 * This is the most-trusted test in the suite: it is the automated version
 * of the manual review's first live check, and the thing the freeze-point-1
 * integration checkpoint in the architecture spec depends on. Treat any
 * change here as needing a second look before merging.
 */
describe('[integration] ingest -> catalog: the facilitator/discovery contract point', () => {
  let catalog: Catalog;

  beforeAll(async () => {
    catalog = await Catalog.connect(testDatabaseUrl());
  });

  afterAll(async () => {
    await catalog?.close();
  });

  beforeEach(async () => {
    await resetDb();
  });

  it('a real POST to /internal/settlement-events results in a real, queryable catalog row', async () => {
    const app = createApp(catalog, {});

    const res = await request(app).post('/internal/settlement-events').send(VALID_EVENT);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true, cataloged: true, dropped: [] });

    const { items, total } = await catalog.list({ limit: 10, offset: 0 });
    expect(total).toBe(1);
    const row = items[0] as Record<string, unknown>;
    expect(row.resource).toBe(VALID_EVENT.resource);
    expect((row.metadata as { provenance: string }).provenance).toBe('observed-settlement');
    expect((row.metadata as { source: string }).source).toBe(VALID_EVENT.txHash);
    expect(row.serviceName).toBe(VALID_EVENT.bazaarMetadata!.serviceName);
  });
});
