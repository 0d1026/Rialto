import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Catalog } from '../../src/catalog.js';
import { createApp } from '../../src/app.js';
import { fakeEmbeddingModel } from '../setup/fake-embedding-model.js';
import { resetDb, testDatabaseUrl } from '../setup/db.js';

/**
 * Cites RFP 3.2 filter surface: GET /discovery/resources filters by type,
 * payTo, scheme, network, and extensions individually and combined (AND,
 * not OR), plus stable limit/offset pagination.
 */
describe('discovery/resources: filters and pagination', () => {
  let catalog: Catalog;

  beforeAll(async () => {
    catalog = await Catalog.connect(testDatabaseUrl());
  });

  afterAll(async () => {
    await catalog?.close();
  });

  async function seed(): Promise<void> {
    await catalog.add(
      {
        resource: 'https://a.example.com/http-exact-testnet-gaaa',
        type: 'http',
        x402Version: 2,
        accepts: [
          { scheme: 'exact', network: 'stellar:testnet', payTo: 'GAAA', asset: 'native', amount: '1' },
        ],
      },
      'registered',
      'seed',
    );
    await catalog.add(
      {
        resource: 'https://a.example.com/mcp-upto-pubnet-gbbb',
        type: 'mcp',
        toolName: 'lookup',
        x402Version: 2,
        accepts: [
          { scheme: 'upto', network: 'stellar:pubnet', payTo: 'GBBB', asset: 'native', amount: '2' },
        ],
      },
      'registered',
      'seed',
    );
    await catalog.add(
      {
        resource: 'https://a.example.com/http-exact-pubnet-gaaa',
        type: 'http',
        x402Version: 2,
        accepts: [
          { scheme: 'exact', network: 'stellar:pubnet', payTo: 'GAAA', asset: 'native', amount: '3' },
        ],
        extensions: { name: 'bazaar' },
      },
      'registered',
      'seed',
    );
  }

  beforeEach(async () => {
    await resetDb();
    await seed();
  });

  it('filters by type', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    const res = await request(app).get('/discovery/resources').query({ type: 'mcp' });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].type).toBe('mcp');
  });

  it('filters by payTo', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    const res = await request(app).get('/discovery/resources').query({ payTo: 'GBBB' });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].resource).toContain('mcp-upto-pubnet-gbbb');
  });

  it('filters by scheme', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    const res = await request(app).get('/discovery/resources').query({ scheme: 'upto' });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].resource).toContain('mcp-upto-pubnet-gbbb');
  });

  it('filters by network', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    const res = await request(app).get('/discovery/resources').query({ network: 'stellar:pubnet' });
    expect(res.body.items).toHaveLength(2);
    const resources = res.body.items.map((i: { resource: string }) => i.resource);
    expect(resources).toEqual(
      expect.arrayContaining([
        expect.stringContaining('mcp-upto-pubnet-gbbb'),
        expect.stringContaining('http-exact-pubnet-gaaa'),
      ]),
    );
  });

  it('filters by extensions', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    const res = await request(app).get('/discovery/resources').query({ extensions: 'bazaar' });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].resource).toContain('http-exact-pubnet-gaaa');
  });

  it('applies combined filters as AND, not OR', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    // type=http AND scheme=exact AND network=stellar:testnet matches only the first seed row,
    // even though other rows independently match type=http or scheme=exact.
    const res = await request(app)
      .get('/discovery/resources')
      .query({ type: 'http', scheme: 'exact', network: 'stellar:testnet' });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].resource).toContain('http-exact-testnet-gaaa');
  });

  it('paginates with stable, non-overlapping pages', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    const page1 = await request(app).get('/discovery/resources').query({ limit: 2, offset: 0 });
    const page2 = await request(app).get('/discovery/resources').query({ limit: 2, offset: 2 });
    expect(page1.body.items).toHaveLength(2);
    expect(page2.body.items).toHaveLength(1);
    expect(page1.body.pagination.total).toBe(3);
    expect(page2.body.pagination.total).toBe(3);
    const page1Resources = page1.body.items.map((i: { resource: string }) => i.resource);
    const page2Resources = page2.body.items.map((i: { resource: string }) => i.resource);
    for (const r of page2Resources) {
      expect(page1Resources).not.toContain(r);
    }
  });
});
