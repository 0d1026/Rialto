import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { Catalog } from '../../src/catalog.js';
import { createApp } from '../../src/app.js';
import { resetDb, testDatabaseUrl, testPool } from '../setup/db.js';
import { fakeEmbeddingModel } from '../setup/fake-embedding-model.js';
import { runWorkerOnce } from '../../src/search/embedding-worker.js';
import { RRF_K, reciprocalRankFusion } from '../../src/search/fusion.js';
import { extractStructuredConstraints } from '../../src/search/query-constraints.js';

/**
 * Stage 3: RRF fusion (rank position only, never a raw score comparison),
 * query-derived structured constraints as hard filters, and partialResults
 * honesty.
 */
describe('reciprocalRankFusion: rank position only, never a raw score comparison', () => {
  it('accepts only arrays of ids in rank order - there is no parameter to pass a score through', () => {
    // documents the contract at the type level: reciprocalRankFusion's
    // signature is (rankedLists: number[][]) => Map<number, number>. There
    // is no score/distance parameter for it to compare - this is enforced
    // by TypeScript at every call site, not just by convention.
    expect(reciprocalRankFusion.length).toBe(1);
  });

  it('fused score depends only on rank position - identical positions produce identical fused scores regardless of what real score magnitudes they stand in for', () => {
    // Ranker A: [10, 20, 30] in this rank order. Ranker B: [30, 10, 20].
    // If fusion secretly used score magnitudes, the outcome would depend on
    // some external notion of "how much better" 1st is than 2nd - it must
    // not, because rank position is all it receives.
    const fusedX = reciprocalRankFusion([
      [10, 20, 30],
      [30, 10, 20],
    ]);
    // A structurally different pair of lists, but 10 and 30 occupy the same
    // rank positions across the two rankers as above (just relabeled) -
    // fused scores for 10 and 30 must come out identical either way.
    const fusedY = reciprocalRankFusion([
      [10, 20, 99],
      [99, 10, 20],
    ]);
    expect(fusedX.get(10)).toBeCloseTo(fusedY.get(10)!);
  });

  it('an id absent from a ranker contributes nothing to its score (not a penalty) - this is what lets fusion degrade gracefully to a single ranker alone', () => {
    const bm25Only = reciprocalRankFusion([[1, 2, 3], []]);
    const expectedRank1 = 1 / (RRF_K + 1);
    const expectedRank2 = 1 / (RRF_K + 2);
    expect(bm25Only.get(1)).toBeCloseTo(expectedRank1);
    expect(bm25Only.get(2)).toBeCloseTo(expectedRank2);
    // relative order matches the single ranker's own order exactly
    expect(bm25Only.get(1)!).toBeGreaterThan(bm25Only.get(2)!);
    expect(bm25Only.get(2)!).toBeGreaterThan(bm25Only.get(3)!);
  });
});

describe('extractStructuredConstraints: network/asset/price parsed out of the query text', () => {
  it('recognizes a network mention and strips it from the text handed to the lexical/dense arms', () => {
    const c = extractStructuredConstraints('weather api on stellar:testnet');
    expect(c.network).toBe('stellar:testnet');
    expect(c.strippedQuery).not.toContain('stellar:testnet');
    expect(c.strippedQuery).toContain('weather');
  });

  it('a query with no recognizable constraints leaves the text unchanged', () => {
    const c = extractStructuredConstraints('weather forecast api');
    expect(c.network).toBeUndefined();
    expect(c.strippedQuery).toBe('weather forecast api');
  });
});

describe('[integration] a network mention applies as a hard filter, not a ranking boost', () => {
  let catalog: Catalog;
  let pool: pg.Pool;
  const model = fakeEmbeddingModel();

  beforeAll(async () => {
    catalog = await Catalog.connect(testDatabaseUrl());
    pool = testPool();
  });

  afterAll(async () => {
    await catalog?.close();
    await pool?.end();
  });

  beforeEach(async () => {
    await resetDb();
    // identical text on both rows - only the network differs, so a
    // ranking-only implementation would rank them near-identically instead
    // of excluding the wrong-network one outright.
    await catalog.add(
      {
        resource: 'https://a.example.com/weather-testnet',
        type: 'http',
        x402Version: 2,
        accepts: [{ scheme: 'exact', network: 'stellar:testnet', payTo: 'G1', asset: 'native', amount: '1' }],
        serviceName: 'WeatherCo',
        description: 'weather forecast data',
      },
      'registered',
      'seed',
    );
    await catalog.add(
      {
        resource: 'https://a.example.com/weather-pubnet',
        type: 'http',
        x402Version: 2,
        accepts: [{ scheme: 'exact', network: 'stellar:pubnet', payTo: 'G2', asset: 'native', amount: '1' }],
        serviceName: 'WeatherCo',
        description: 'weather forecast data',
      },
      'registered',
      'seed',
    );
  });

  it('excludes the near-miss wrong-network row entirely, not merely ranks it lower', async () => {
    const app = createApp(catalog, { embeddingModel: model });
    const res = await request(app)
      .get('/discovery/search')
      .query({ query: 'weather forecast on stellar:testnet' });
    expect(res.status).toBe(200);
    const resources = res.body.resources.map((r: { resource: string }) => r.resource);
    expect(resources).toContain('https://a.example.com/weather-testnet');
    expect(resources).not.toContain('https://a.example.com/weather-pubnet');
  });
});

describe('[integration] partialResults reflects the dense arm honestly', () => {
  let catalog: Catalog;
  let pool: pg.Pool;
  const model = fakeEmbeddingModel();

  beforeAll(async () => {
    catalog = await Catalog.connect(testDatabaseUrl());
    pool = testPool();
  });

  afterAll(async () => {
    await catalog?.close();
    await pool?.end();
  });

  beforeEach(async () => {
    await resetDb();
  });

  it('is true while the embedding worker has a backlog', async () => {
    await catalog.add(
      {
        resource: 'https://a.example.com/backlog-test',
        type: 'http',
        x402Version: 2,
        accepts: [{ scheme: 'exact', network: 'stellar:testnet', payTo: 'G1', asset: 'native', amount: '1' }],
        serviceName: 'BacklogCo',
      },
      'registered',
      'seed',
    );
    // deliberately do not run the worker - the job is still pending
    const app = createApp(catalog, { embeddingModel: model });
    const res = await request(app).get('/discovery/search').query({ query: 'BacklogCo' });
    expect(res.body.partialResults).toBe(true);
  });

  it('is false once the backlog is cleared and the dense arm has vectors', async () => {
    await catalog.add(
      {
        resource: 'https://a.example.com/no-backlog-test',
        type: 'http',
        x402Version: 2,
        accepts: [{ scheme: 'exact', network: 'stellar:testnet', payTo: 'G1', asset: 'native', amount: '1' }],
        serviceName: 'NoBacklogCo',
      },
      'registered',
      'seed',
    );
    await runWorkerOnce(pool, model);
    const app = createApp(catalog, { embeddingModel: model });
    const res = await request(app).get('/discovery/search').query({ query: 'NoBacklogCo' });
    expect(res.body.partialResults).toBe(false);
    // and BM25-only-derived-plus-dense results are still returned, correctly
    const resources = res.body.resources.map((r: { resource: string }) => r.resource);
    expect(resources).toContain('https://a.example.com/no-backlog-test');
  });
});
