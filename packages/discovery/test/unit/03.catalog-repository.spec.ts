import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Catalog } from '../../src/catalog.js';
import { createApp } from '../../src/app.js';
import { fakeEmbeddingModel } from '../setup/fake-embedding-model.js';
import { resetDb, testDatabaseUrl } from '../setup/db.js';
import {
  EVENT_WITHOUT_BAZAAR_METADATA,
  REPEAT_SETTLEMENT_EVENT,
  VALID_EVENT,
} from '../fixtures/settlement-events.js';

/**
 * Cites RFP 3.2 cataloging behavior: a settlement carrying bazaarMetadata
 * creates a catalog row; one without creates nothing; a second settlement
 * for the same resource upserts rather than duplicating, and increments
 * `settlement_count` atomically (stage 0 of the BM25/hybrid search work,
 * migrations/0001_settlement_count.sql) - that column backs stage 3's
 * settlement-history ranking.
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

  it('a settlement with valid bazaarMetadata creates exactly one new row, settlement_count = 1', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    await request(app).post('/internal/settlement-events').send(VALID_EVENT).expect(202);
    expect(await catalog.count()).toBe(1);
    const { items } = await catalog.list({ limit: 10, offset: 0 });
    const row = items[0] as { metadata: { settlementCount: number } };
    expect(row.metadata.settlementCount).toBe(1);
  });

  it('a settlement with no bazaarMetadata creates no row', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    const res = await request(app)
      .post('/internal/settlement-events')
      .send(EVENT_WITHOUT_BAZAAR_METADATA);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true, cataloged: false });
    expect(await catalog.count()).toBe(0);
  });

  it('a second settlement for an already-cataloged resource upserts the same row, not a duplicate, settlement_count = 2', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    await request(app).post('/internal/settlement-events').send(VALID_EVENT).expect(202);
    const { items: before } = await catalog.list({ limit: 10, offset: 0 });
    expect(before).toHaveLength(1);
    const firstUpdated = new Date((before[0] as { lastUpdated: string }).lastUpdated).getTime();

    await request(app)
      .post('/internal/settlement-events')
      .send(REPEAT_SETTLEMENT_EVENT)
      .expect(202);

    expect(await catalog.count()).toBe(1);
    // query the row directly via the repository, not the HTTP response, per
    // the acceptance criteria - the API response alone wouldn't distinguish
    // a real atomic increment from one hardcoded into the wire mapper.
    const { items: after } = await catalog.list({ limit: 10, offset: 0 });
    expect(after).toHaveLength(1);
    const row = after[0] as {
      lastUpdated: string;
      description: string;
      metadata: { settlementCount: number };
    };
    expect(new Date(row.lastUpdated).getTime()).toBeGreaterThanOrEqual(firstUpdated);
    expect(row.description).toBe(REPEAT_SETTLEMENT_EVENT.bazaarMetadata!.description);
    expect(row.metadata.settlementCount).toBe(2);
  });

  it('concurrent settlements for the same resource all land in settlement_count, none lost to a read-then-write race', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    const CONCURRENCY = 10;
    // all CONCURRENCY requests target the same (resource, toolName) conflict
    // key - if the increment were read-modify-write in application code
    // rather than a single atomic `UPDATE ... SET settlement_count =
    // settlement_count + 1`, this is exactly the pattern that would lose
    // updates to the classic read-then-write race.
    await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        request(app)
          .post('/internal/settlement-events')
          .send({ ...VALID_EVENT, txHash: `tx-concurrent-${i}` }),
      ),
    );

    expect(await catalog.count()).toBe(1);
    const { items } = await catalog.list({ limit: 10, offset: 0 });
    const row = items[0] as { metadata: { settlementCount: number } };
    expect(row.metadata.settlementCount).toBe(CONCURRENCY);
  });
});
