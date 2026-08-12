import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Catalog } from '../../src/catalog.js';
import { createApp } from '../../src/app.js';
import { fakeEmbeddingModel } from '../setup/fake-embedding-model.js';
import { resetDb, testDatabaseUrl } from '../setup/db.js';
import { SECOND_VALID_EVENT, VALID_EVENT } from '../fixtures/settlement-events.js';

/**
 * GET /discovery/resource: the single-resource lookup get_resource (in
 * @rialto/mcp-server) calls after search_resources narrows a candidate.
 * Rows key on (resource, tool_name) - VALID_EVENT has no toolName, so it
 * lands at tool_name = '' and is only reachable by resource alone.
 */
describe('[integration] GET /discovery/resource', () => {
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

  it('returns the cataloged resource by resource id', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    await request(app).post('/internal/settlement-events').send(VALID_EVENT).expect(202);

    const res = await request(app)
      .get('/discovery/resource')
      .query({ resource: VALID_EVENT.resource });

    expect(res.status).toBe(200);
    expect(res.body.x402Version).toBe(2);
    expect(res.body.item.resource).toBe(VALID_EVENT.resource);
    expect(res.body.item.serviceName).toBe(VALID_EVENT.bazaarMetadata!.serviceName);
    expect(res.body.item.accepts).toEqual([
      {
        scheme: VALID_EVENT.scheme,
        network: VALID_EVENT.network,
        payTo: VALID_EVENT.payTo,
        asset: VALID_EVENT.asset,
        amount: VALID_EVENT.amount,
      },
    ]);
  });

  it('404s with resource_not_found when nothing matches', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });

    const res = await request(app)
      .get('/discovery/resource')
      .query({ resource: 'https://nothing-here.example/x' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('resource_not_found');
  });

  it('400s when resource is omitted', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });

    const res = await request(app).get('/discovery/resource');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('payload_invalid');
  });

  it('does not cross-match a different resource sharing no key with the query', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    await request(app).post('/internal/settlement-events').send(VALID_EVENT).expect(202);
    await request(app).post('/internal/settlement-events').send(SECOND_VALID_EVENT).expect(202);

    const res = await request(app)
      .get('/discovery/resource')
      .query({ resource: SECOND_VALID_EVENT.resource });

    expect(res.status).toBe(200);
    expect(res.body.item.resource).toBe(SECOND_VALID_EVENT.resource);
    expect(res.body.item.serviceName).toBe(SECOND_VALID_EVENT.bazaarMetadata!.serviceName);
  });
});
