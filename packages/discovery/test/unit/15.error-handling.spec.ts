import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Catalog } from '../../src/catalog.js';
import { createApp } from '../../src/app.js';
import { fakeEmbeddingModel } from '../setup/fake-embedding-model.js';
import { resetDb, testDatabaseUrl } from '../setup/db.js';

/**
 * regression: malformed jsonpath from the extensions filter leaked a stack
 * trace via an unhandled error
 *
 * Manual review finding: GET /discovery/resources?extensions=<value> builds
 * a jsonpath string literal by manually stripping `"` characters from the
 * user-supplied value (catalog.ts's filterClauses), without escaping
 * backslashes. A value ending in `\` produced an unterminated-string
 * jsonpath parse error at the database layer - and because
 * packages/discovery/src/app.ts had no error-handling middleware (unlike
 * the facilitator's, which does), that unhandled rejection fell through to
 * Express's own default handler, which renders an HTML page containing the
 * error's stack trace - absolute server file paths and library internals -
 * directly in the response body. Reproduced live with
 * `GET /discovery/resources?extensions=foo%5C` before the fix (a 500 with
 * an HTML body containing `pg-pool/index.js`, `catalog.ts:273`, etc.).
 *
 * Two independent fixes, both covered here: the jsonpath construction now
 * uses JSON.stringify (whose escaping rules jsonpath string literals
 * share) instead of hand-rolled quote-stripping, so malformed input can't
 * reach Postgres as invalid syntax in the first place; and app.ts now has
 * the same coded-JSON error-handling middleware the facilitator already
 * had, so any *other* unhandled error also can't leak a stack trace, even
 * one this test suite doesn't specifically anticipate.
 */
describe('regression: extensions filter with special characters never leaks a stack trace', () => {
  let catalog: Catalog;
  const model = fakeEmbeddingModel();

  beforeAll(async () => {
    catalog = await Catalog.connect(testDatabaseUrl());
  });

  afterAll(async () => {
    await catalog?.close();
  });

  beforeEach(async () => {
    await resetDb();
  });

  it.each([
    ['trailing backslash', 'foo\\'],
    ['embedded quote and backslash', 'foo"bar\\baz'],
    ['multiple trailing backslashes', 'foo\\\\\\'],
    ['jsonpath-operator-shaped input', 'x) || (1==1'],
  ])('a value with %s does not 500 or return HTML', async (_label, value) => {
    const app = createApp(catalog, { embeddingModel: model });
    const res = await request(app).get('/discovery/resources').query({ extensions: value });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.items).toEqual([]);
  });

  it('a value with special characters still matches a resource that genuinely has that extension value', async () => {
    await catalog.add(
      {
        resource: 'https://a.example.com/quoted-ext',
        type: 'http',
        x402Version: 2,
        accepts: [{ scheme: 'exact', network: 'stellar:testnet', payTo: 'G1', asset: 'native', amount: '1' }],
        serviceName: 'QuotedExt',
        extensions: { name: 'foo"bar\\baz' },
      },
      'registered',
      'seed',
    );
    const app = createApp(catalog, { embeddingModel: model });
    const res = await request(app)
      .get('/discovery/resources')
      .query({ extensions: 'foo"bar\\baz' });
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { resource: string }) => i.resource)).toContain(
      'https://a.example.com/quoted-ext',
    );
  });

  it('any unhandled error returns a coded JSON response, not an HTML stack trace', async () => {
    // Force a genuine unhandled error independent of the jsonpath fix above,
    // to prove the middleware itself works for errors this suite doesn't
    // specifically anticipate: end the pool out from under a live app
    // instance, so the next query rejects with a real driver-level error.
    const isolatedCatalog = await Catalog.connect(testDatabaseUrl());
    const app = createApp(isolatedCatalog, { embeddingModel: model });
    await isolatedCatalog.close();

    const res = await request(app).get('/discovery/resources');
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toEqual({ error: { code: 'simulation_failed', reason: 'Internal server error' } });
  });
});
