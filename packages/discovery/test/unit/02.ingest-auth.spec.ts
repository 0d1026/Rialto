import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Catalog } from '../../src/catalog.js';
import { createApp } from '../../src/app.js';
import { fakeEmbeddingModel } from '../setup/fake-embedding-model.js';
import { resetDb, testDatabaseUrl } from '../setup/db.js';
import { VALID_EVENT } from '../fixtures/settlement-events.js';

/**
 * Regression coverage for the manually-found ingest auth behavior: no token
 * or the wrong token must 401, the right token must succeed.
 *
 * The manual review's one false alarm here was a stale OS process still
 * holding the port from an earlier test run, not a code defect. This suite
 * never calls `app.listen()` - supertest drives the Express app instance
 * directly over an in-process socket per request, so there is no real port
 * for a leftover process to hold in the first place. That class of flake is
 * structurally impossible here, not just avoided by discipline.
 */
describe('ingest auth gate: POST /internal/settlement-events', () => {
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

  it('rejects a request with no bearer token', async () => {
    const app = createApp(catalog, { ingestToken: 'secret123', embeddingModel: fakeEmbeddingModel() });
    const res = await request(app).post('/internal/settlement-events').send(VALID_EVENT);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('payload_invalid');
  });

  it('rejects a request with an incorrect bearer token', async () => {
    const app = createApp(catalog, { ingestToken: 'secret123', embeddingModel: fakeEmbeddingModel() });
    const res = await request(app)
      .post('/internal/settlement-events')
      .set('authorization', 'Bearer wrong-token')
      .send(VALID_EVENT);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('payload_invalid');
  });

  it('accepts a request with the correct bearer token', async () => {
    const app = createApp(catalog, { ingestToken: 'secret123', embeddingModel: fakeEmbeddingModel() });
    const res = await request(app)
      .post('/internal/settlement-events')
      .set('authorization', 'Bearer secret123')
      .send(VALID_EVENT);
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ accepted: true, cataloged: true });
  });

  it('when no ingestToken is configured, the endpoint is open (local/private use only)', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    const res = await request(app).post('/internal/settlement-events').send(VALID_EVENT);
    expect(res.status).toBe(202);
  });
});
