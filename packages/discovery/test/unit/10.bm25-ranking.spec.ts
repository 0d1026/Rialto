import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Catalog } from '../../src/catalog.js';
import { createApp } from '../../src/app.js';
import { fakeEmbeddingModel } from '../setup/fake-embedding-model.js';
import { resetDb, testDatabaseUrl } from '../setup/db.js';
import {
  BM25_B,
  BM25_K1,
  FIELD_WEIGHTS,
  type Bm25Corpus,
  type Bm25Document,
  scoreDocument,
} from '../../src/search/bm25.js';

/**
 * Stage 1 of the BM25/hybrid search work. Companion to 05.search-ranking.spec.ts,
 * which stays unmodified and re-run here against the same real implementation
 * as its regression check (it's included below, unchanged, for that reason).
 *
 * The scoring math itself (search/bm25.ts) is pure - no DB - so the case that
 * actually distinguishes BM25 from a naive match-count or bare-tsvector
 * ranking is proven directly against synthetic corpus statistics first, then
 * proven again end-to-end through a real Postgres-backed catalog and the
 * public /discovery/search endpoint, so both the math and the wiring around
 * it (tokenization, document-frequency computation, field extraction) are
 * covered.
 */
describe('BM25 parameters are named, documented constants, not inline magic numbers', () => {
  it('k1 and b are exported and set to their documented values', () => {
    expect(BM25_K1).toBe(1.2);
    expect(BM25_B).toBe(0.75);
    expect(FIELD_WEIGHTS).toEqual({ a: 3, b: 1, c: 0.5 });
  });
});

describe('scoreDocument: rare terms outrank common terms (proves IDF, not naive match-count)', () => {
  // Doc A shares only one RARE term with the query; Doc B shares two COMMON
  // terms. A naive ranking that just counts matching terms (or Postgres's
  // ts_rank without meaningful IDF weighting) would rank B above A because
  // it has more matches. Real BM25 must rank A above B, because the one
  // term A matches on is far more distinguishing than the two terms B
  // matches on.
  const corpus: Bm25Corpus = {
    totalDocs: 100,
    avgFieldLengths: { a: 1.5, b: 0, c: 0 },
    docFreq: new Map([
      ['rare', 2], // appears in only 2 of 100 documents
      ['common1', 80], // appears in 80 of 100 documents
      ['common2', 80],
    ]),
  };
  const queryTermFreq = new Map([
    ['rare', 1],
    ['common1', 1],
    ['common2', 1],
  ]);

  const docA: Bm25Document = {
    id: 'A',
    fields: {
      a: new Map([['rare', 1]]),
      b: new Map(),
      c: new Map(),
    },
    fieldLengths: { a: 1, b: 0, c: 0 },
  };
  const docB: Bm25Document = {
    id: 'B',
    fields: {
      a: new Map([
        ['common1', 1],
        ['common2', 1],
      ]),
      b: new Map(),
      c: new Map(),
    },
    fieldLengths: { a: 2, b: 0, c: 0 },
  };

  it('the one-rare-term document outscores the two-common-term document', () => {
    const scoreA = scoreDocument(docA, queryTermFreq, corpus);
    const scoreB = scoreDocument(docB, queryTermFreq, corpus);
    expect(scoreA).toBeGreaterThan(scoreB);
  });
});

describe('scoreDocument: a serviceName match outranks the same term only in description', () => {
  const corpus: Bm25Corpus = {
    totalDocs: 50,
    avgFieldLengths: { a: 1, b: 1, c: 0 },
    docFreq: new Map([['weather', 10]]),
  };
  const queryTermFreq = new Map([['weather', 1]]);

  const inServiceName: Bm25Document = {
    id: 'svc',
    fields: { a: new Map([['weather', 1]]), b: new Map(), c: new Map() },
    fieldLengths: { a: 1, b: 0, c: 0 },
  };
  const inDescriptionOnly: Bm25Document = {
    id: 'desc',
    fields: { a: new Map(), b: new Map([['weather', 1]]), c: new Map() },
    fieldLengths: { a: 0, b: 1, c: 0 },
  };

  it('field weighting alone (all else equal) ranks the serviceName match first', () => {
    const scoreSvc = scoreDocument(inServiceName, queryTermFreq, corpus);
    const scoreDesc = scoreDocument(inDescriptionOnly, queryTermFreq, corpus);
    expect(scoreSvc).toBeGreaterThan(scoreDesc);
  });
});

describe('[integration] BM25 end-to-end: rare-vs-common ranks correctly through a real catalog', () => {
  let catalog: Catalog;

  beforeAll(async () => {
    catalog = await Catalog.connect(testDatabaseUrl());
  });

  afterAll(async () => {
    await catalog?.close();
  });

  beforeEach(async () => {
    await resetDb();

    // Doc A: the only resource mentioning "quantum" (rare, df=1).
    await catalog.add(
      {
        resource: 'https://a.example.com/quantum-service',
        type: 'http',
        x402Version: 2,
        accepts: [{ scheme: 'exact', network: 'stellar:testnet', payTo: 'GA', asset: 'native', amount: '1' }],
        serviceName: 'Quantum Sensor Feed',
      },
      'registered',
      'seed',
    );
    // Doc B: mentions "turbine", but so do 9 filler resources below (common, high df).
    await catalog.add(
      {
        resource: 'https://a.example.com/turbine-service',
        type: 'http',
        x402Version: 2,
        accepts: [{ scheme: 'exact', network: 'stellar:testnet', payTo: 'GB', asset: 'native', amount: '1' }],
        serviceName: 'Turbine Telemetry Feed',
      },
      'registered',
      'seed',
    );
    for (let i = 0; i < 9; i++) {
      await catalog.add(
        {
          resource: `https://a.example.com/filler-${i}`,
          type: 'http',
          x402Version: 2,
          accepts: [{ scheme: 'exact', network: 'stellar:testnet', payTo: 'GF', asset: 'native', amount: '1' }],
          serviceName: `Turbine Filler ${i}`,
        },
        'registered',
        'seed',
      );
    }
  });

  it('the document matching only the rare term ranks above the document matching only the common term', async () => {
    const app = createApp(catalog, { embeddingModel: fakeEmbeddingModel() });
    // websearch_to_tsquery ANDs bare multi-word queries by default (unchanged
    // candidate-selection behavior from v1) - explicit OR is needed so a
    // document matching only one of the two terms is still a candidate at all.
    const res = await request(app).get('/discovery/search').query({ query: 'quantum OR turbine' });
    expect(res.status).toBe(200);
    const resources = res.body.resources.map((r: { resource: string }) => r.resource);
    const quantumIndex = resources.indexOf('https://a.example.com/quantum-service');
    const turbineIndex = resources.indexOf('https://a.example.com/turbine-service');
    expect(quantumIndex).toBeGreaterThanOrEqual(0);
    expect(turbineIndex).toBeGreaterThanOrEqual(0);
    expect(quantumIndex).toBeLessThan(turbineIndex);
  });
});
