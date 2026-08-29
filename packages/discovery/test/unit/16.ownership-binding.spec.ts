import request from 'supertest';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Catalog } from '../../src/catalog.js';
import { createApp } from '../../src/app.js';
import { fakeEmbeddingModel } from '../setup/fake-embedding-model.js';
import { resetDb, testDatabaseUrl } from '../setup/db.js';
import { HIJACK_EVENT, REPEAT_SETTLEMENT_EVENT, VALID_EVENT } from '../fixtures/settlement-events.js';

/**
 * [threat-model §3] Trust-on-first-use ownership binding
 * (migrations/0004_ownership_binding.sql).
 *
 * The first observed-settlement write for a (resource, tool_name) binds the
 * row to that settlement's payTo. A later write with a different payTo -
 * whether another settlement or a federation-ingested entry - must be
 * refused from the catalog without touching the row, so an attacker cannot
 * overwrite a seller's payment terms or inherit its settlement_count. Rows
 * that never settled keep last-write-wins so federation re-syncs still
 * refresh them. The payment itself is never blocked; only the catalog write
 * is, reported as `ownership_conflict`.
 */
describe('ownership binding: first settlement binds payTo', () => {
  let catalog: Catalog;
  let pool: pg.Pool;

  beforeAll(async () => {
    catalog = await Catalog.connect(testDatabaseUrl());
    pool = new pg.Pool({ connectionString: testDatabaseUrl() });
  });

  afterAll(async () => {
    await catalog?.close();
    await pool?.end();
  });

  beforeEach(async () => {
    await resetDb();
  });

  async function boundRow(resource: string): Promise<{
    bound_pay_to: string | null;
    provenance: string;
    settlement_count: number;
    description: string | null;
  }> {
    const res = await pool.query(
      'SELECT bound_pay_to, provenance, settlement_count, description FROM resources WHERE resource = $1',
      [resource],
    );
    return res.rows[0];
  }

  it('the first settlement binds the row to its payTo and exposes ownerBound on the wire', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    await request(app).post('/internal/settlement-events').send(VALID_EVENT).expect(202);

    const row = await boundRow(VALID_EVENT.resource);
    expect(row.bound_pay_to).toBe(VALID_EVENT.payTo);

    const { items } = await catalog.list({ limit: 10, offset: 0 });
    const wire = items[0] as { metadata: { ownerBound: boolean } };
    expect(wire.metadata.ownerBound).toBe(true);
  });

  it('a repeat settlement with the same payTo still upserts and increments', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    await request(app).post('/internal/settlement-events').send(VALID_EVENT).expect(202);
    await request(app).post('/internal/settlement-events').send(REPEAT_SETTLEMENT_EVENT).expect(202);

    const row = await boundRow(VALID_EVENT.resource);
    expect(row.settlement_count).toBe(2);
    expect(row.description).toBe(REPEAT_SETTLEMENT_EVENT.bazaarMetadata!.description);
    expect(row.bound_pay_to).toBe(VALID_EVENT.payTo);
  });

  it('a settlement with a different payTo is refused: 202, cataloged false, row untouched', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    await request(app).post('/internal/settlement-events').send(VALID_EVENT).expect(202);

    const res = await request(app).post('/internal/settlement-events').send(HIJACK_EVENT);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true, cataloged: false, reason: 'ownership_conflict' });

    const row = await boundRow(VALID_EVENT.resource);
    expect(row.bound_pay_to).toBe(VALID_EVENT.payTo);
    expect(row.settlement_count).toBe(1);
    expect(row.description).toBe(VALID_EVENT.bazaarMetadata!.description);
    expect(await catalog.count()).toBe(1);
  });

  it('concurrent mixed-payTo settlements against a bound row: only matching writes land', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    await request(app).post('/internal/settlement-events').send(VALID_EVENT).expect(202);

    const CONCURRENCY = 10;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        request(app)
          .post('/internal/settlement-events')
          .send(
            i % 2 === 0
              ? { ...VALID_EVENT, txHash: `tx-race-owner-${i}` }
              : { ...HIJACK_EVENT, txHash: `tx-race-attacker-${i}` },
          ),
      ),
    );

    const row = await boundRow(VALID_EVENT.resource);
    expect(row.bound_pay_to).toBe(VALID_EVENT.payTo);
    expect(row.settlement_count).toBe(1 + CONCURRENCY / 2);
    expect(await catalog.count()).toBe(1);
  });

  it('an ingested write cannot displace a bound row with a different payTo', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    await request(app).post('/internal/settlement-events').send(VALID_EVENT).expect(202);

    const result = await catalog.add(
      {
        resource: VALID_EVENT.resource,
        type: 'http',
        x402Version: 1,
        accepts: [
          { scheme: 'exact', network: 'stellar:pubnet', payTo: 'GPOISONEDADDRESS', asset: 'native', amount: '1' },
        ],
        description: 'poisoned import',
      },
      'ingested',
      'https://evil.example/catalog',
    );

    expect(result).toEqual({ ok: false, reason: 'ownership_conflict' });
    const row = await boundRow(VALID_EVENT.resource);
    expect(row.description).toBe(VALID_EVENT.bazaarMetadata!.description);
    expect(row.provenance).toBe('observed-settlement');
  });

  it('a mixed accepts array smuggling an attacker payTo alongside the bound one is refused whole', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    await request(app).post('/internal/settlement-events').send(VALID_EVENT).expect(202);

    const result = await catalog.add(
      {
        resource: VALID_EVENT.resource,
        type: 'http',
        x402Version: 2,
        accepts: [
          { scheme: 'exact', network: 'stellar:testnet', payTo: VALID_EVENT.payTo, asset: 'native', amount: '1000000' },
          { scheme: 'exact', network: 'stellar:testnet', payTo: 'GATTACKERADDRESS', asset: 'native', amount: '1' },
        ],
        description: 'looks legitimate, adds a second payout option',
      },
      'ingested',
      'https://evil.example/catalog',
    );

    expect(result).toEqual({ ok: false, reason: 'ownership_conflict' });
    const row = await boundRow(VALID_EVENT.resource);
    expect(row.description).toBe(VALID_EVENT.bazaarMetadata!.description);
  });

  it('a settlement claims an ingested-first row: binds it and upgrades provenance', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    await catalog.add(
      {
        resource: VALID_EVENT.resource,
        type: 'http',
        x402Version: 2,
        accepts: [
          { scheme: 'exact', network: 'stellar:testnet', payTo: VALID_EVENT.payTo, asset: 'native', amount: '1000000' },
        ],
        description: 'imported listing',
      },
      'ingested',
      'cdp-bazaar',
    );
    let row = await boundRow(VALID_EVENT.resource);
    expect(row.bound_pay_to).toBeNull();
    expect(row.provenance).toBe('ingested');

    await request(app).post('/internal/settlement-events').send(VALID_EVENT).expect(202);

    row = await boundRow(VALID_EVENT.resource);
    expect(row.bound_pay_to).toBe(VALID_EVENT.payTo);
    expect(row.provenance).toBe('observed-settlement');
    expect(row.settlement_count).toBe(1);
  });

  it('a never-settled ingested row still updates freely on re-sync', async () => {
    const first = await catalog.add(
      {
        resource: 'https://feed.example.com/api',
        type: 'http',
        x402Version: 1,
        accepts: [
          { scheme: 'exact', network: 'stellar:pubnet', payTo: 'GFEEDADDRESSONE', asset: 'native', amount: '5' },
        ],
        description: 'v1 of the listing',
      },
      'ingested',
      'https://peer.example/catalog',
    );
    expect(first.ok).toBe(true);

    const second = await catalog.add(
      {
        resource: 'https://feed.example.com/api',
        type: 'http',
        x402Version: 1,
        accepts: [
          { scheme: 'exact', network: 'stellar:pubnet', payTo: 'GFEEDADDRESSTWO', asset: 'native', amount: '7' },
        ],
        description: 'v2 of the listing',
      },
      'ingested',
      'https://peer.example/catalog',
    );
    expect(second.ok).toBe(true);

    const row = await boundRow('https://feed.example.com/api');
    expect(row.bound_pay_to).toBeNull();
    expect(row.description).toBe('v2 of the listing');
  });
});
