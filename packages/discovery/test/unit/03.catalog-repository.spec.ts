import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Catalog } from '../../src/catalog.js';
import { createApp } from '../../src/app.js';
import { resetDb, testDatabaseUrl } from '../setup/db.js';
import {
  EVENT_WITHOUT_BAZAAR_METADATA,
  REPEAT_SETTLEMENT_EVENT,
  VALID_EVENT,
} from '../fixtures/settlement-events.js';

/**
 * Cites RFP 3.2 cataloging behavior: a settlement carrying bazaarMetadata
 * creates a catalog row; one without creates nothing; a second settlement
 * for the same resource upserts rather than duplicating.
 *
 * Note on scope: the manual review's writeup mentioned a "settlement count"
 * incrementing on repeat settlement. The current schema (packages/discovery/
 * src/catalog.ts) has no such column - only `last_updated`/`first_seen`
 * timestamps. This suite asserts what the code actually does today (upsert,
 * `last_updated` advances, no duplicate row); it does not assert a counter
 * that doesn't exist, and does not add one - that would be a schema change,
 * out of scope for a test suite.
 */
describe('catalog repository: settlement -> row lifecycle', () => {
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

  it('a settlement with valid bazaarMetadata creates exactly one new row', async () => {
    const app = createApp(catalog, {});
    await request(app).post('/internal/settlement-events').send(VALID_EVENT).expect(202);
    expect(await catalog.count()).toBe(1);
  });

  it('a settlement with no bazaarMetadata creates no row', async () => {
    const app = createApp(catalog, {});
    const res = await request(app)
      .post('/internal/settlement-events')
      .send(EVENT_WITHOUT_BAZAAR_METADATA);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true, cataloged: false });
    expect(await catalog.count()).toBe(0);
  });

  it('a second settlement for an already-cataloged resource upserts the same row, not a duplicate', async () => {
    const app = createApp(catalog, {});
    await request(app).post('/internal/settlement-events').send(VALID_EVENT).expect(202);
    const { items: before } = await catalog.list({ limit: 10, offset: 0 });
    expect(before).toHaveLength(1);
    const firstUpdated = new Date((before[0] as { lastUpdated: string }).lastUpdated).getTime();

    await request(app)
      .post('/internal/settlement-events')
      .send(REPEAT_SETTLEMENT_EVENT)
      .expect(202);

    expect(await catalog.count()).toBe(1);
    const { items: after } = await catalog.list({ limit: 10, offset: 0 });
    expect(after).toHaveLength(1);
    const row = after[0] as { lastUpdated: string; description: string };
    expect(new Date(row.lastUpdated).getTime()).toBeGreaterThanOrEqual(firstUpdated);
    expect(row.description).toBe(REPEAT_SETTLEMENT_EVENT.bazaarMetadata!.description);
  });
});
