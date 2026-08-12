import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Catalog } from '../../src/catalog.js';
import { createApp } from '../../src/app.js';
import { fakeEmbeddingModel } from '../setup/fake-embedding-model.js';
import { resetDb, testDatabaseUrl } from '../setup/db.js';
import { SECOND_VALID_EVENT, VALID_EVENT } from '../fixtures/settlement-events.js';

/**
 * Ingests via the real ingestion endpoint (not a direct DB write), then
 * confirms the entries are findable through the *public* API. This is the
 * test that would catch ingestion writing correctly while search reads from
 * a stale index or the wrong table - a bug the repository-level tests in
 * 03/06 cannot see, since they query the same table ingestion just wrote to.
 */
describe('[integration] search end-to-end: ingest via HTTP, read back via the public API', () => {
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

  it('resources ingested via /internal/settlement-events are findable via /discovery/resources and /discovery/search', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });

    await request(app).post('/internal/settlement-events').send(VALID_EVENT).expect(202);
    await request(app).post('/internal/settlement-events').send(SECOND_VALID_EVENT).expect(202);

    const listRes = await request(app).get('/discovery/resources');
    const listed = listRes.body.items.map((i: { resource: string }) => i.resource);
    expect(listed).toEqual(
      expect.arrayContaining([VALID_EVENT.resource, SECOND_VALID_EVENT.resource]),
    );

    const searchRes = await request(app)
      .get('/discovery/search')
      .query({ query: SECOND_VALID_EVENT.bazaarMetadata!.serviceName });
    const found = searchRes.body.resources.map((r: { resource: string }) => r.resource);
    expect(found).toContain(SECOND_VALID_EVENT.resource);
  });
});
