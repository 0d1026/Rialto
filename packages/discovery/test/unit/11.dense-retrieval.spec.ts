import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import pgvector from 'pgvector/pg';
import { Catalog } from '../../src/catalog.js';
import { resetDb, testDatabaseUrl, testPool } from '../setup/db.js';
import { fakeEmbeddingModel } from '../setup/fake-embedding-model.js';
import { localEmbeddingModel } from '../../src/search/embedding-model.js';
import {
  claimBatch,
  getOrCreateGeneration,
  runWorkerOnce,
} from '../../src/search/embedding-worker.js';
import { denseSearch } from '../../src/search/dense.js';

/**
 * Stage 2 of the BM25/hybrid search work: async embedding worker,
 * generation-versioned vector storage, dense retrieval. Uses the fake,
 * offline embedding model (test/setup/fake-embedding-model.ts) for fast,
 * deterministic plumbing tests; the [MODEL] block at the bottom uses the
 * real local model to prove paraphrase retrieval actually works, not just
 * that vectors get written and read back.
 */
describe('embedding worker + dense retrieval (fake model, plumbing)', () => {
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

  it('a resource cataloged while the worker is stopped has no vectors until the worker runs', async () => {
    await catalog.add(
      {
        resource: 'https://a.example.com/weather-svc',
        type: 'http',
        x402Version: 2,
        accepts: [{ scheme: 'exact', network: 'stellar:testnet', payTo: 'G1', asset: 'native', amount: '1' }],
        serviceName: 'WeatherCo',
        description: 'weather forecast data',
      },
      'registered',
      'seed',
    );
    const resourceRow = await pool.query<{ id: number }>('SELECT id FROM resources LIMIT 1');
    const resourceId = resourceRow.rows[0].id;

    const before = await pool.query('SELECT * FROM embeddings WHERE resource_id = $1', [resourceId]);
    expect(before.rows).toHaveLength(0);

    const stats = await runWorkerOnce(pool, model);
    expect(stats.claimed).toBe(1);
    expect(stats.succeeded).toBe(1);

    const after = await pool.query('SELECT kind FROM embeddings WHERE resource_id = $1', [resourceId]);
    // one 'resource' embedding + N synthetic_query embeddings (generateSyntheticQueries)
    expect(after.rows.length).toBeGreaterThan(1);
    expect(after.rows.some((r) => r.kind === 'resource')).toBe(true);
    expect(after.rows.some((r) => r.kind === 'synthetic_query')).toBe(true);
  });

  it('getOrCreateGeneration is deterministic: the same model config always resolves to the same generation id', async () => {
    const id1 = await getOrCreateGeneration(pool, model);
    const id2 = await getOrCreateGeneration(pool, model);
    expect(id1).toBe(id2);
    const count = await pool.query('SELECT count(*)::int AS n FROM generations');
    expect(count.rows[0].n).toBe(1);
  });

  it('dense search only queries the current generation; a resource with vectors only in an old generation is never returned', async () => {
    await catalog.add(
      {
        resource: 'https://a.example.com/current-gen',
        type: 'http',
        x402Version: 2,
        accepts: [{ scheme: 'exact', network: 'stellar:testnet', payTo: 'G1', asset: 'native', amount: '1' }],
        serviceName: 'Weather Current',
        description: 'weather forecast data',
      },
      'registered',
      'seed',
    );
    await runWorkerOnce(pool, model); // embeds under the current generation for `model`

    // Simulate a stale generation left behind by a prior model/config change:
    // a different resource whose ONLY vectors live under a different
    // generation (different dimension), never processed by the current model.
    const staleGen = await pool.query<{ id: number }>(
      `INSERT INTO generations (model_id, revision, dimension, pooling, normalization)
       VALUES ('stale-model', 'v0', 999, 'mean', 'l2') RETURNING id`,
    );
    const staleResource = await catalog.add(
      {
        resource: 'https://a.example.com/stale-gen',
        type: 'http',
        x402Version: 2,
        accepts: [{ scheme: 'exact', network: 'stellar:testnet', payTo: 'G2', asset: 'native', amount: '1' }],
        serviceName: 'Weather Stale',
        description: 'weather forecast data',
      },
      'registered',
      'seed',
    );
    void staleResource;
    const staleRow = await pool.query<{ id: number }>(
      `SELECT id FROM resources WHERE resource = 'https://a.example.com/stale-gen'`,
    );
    // A vector engineered to score highest possible (identical direction to
    // whatever the query embeds to isn't knowable without running the
    // query first, so instead: give it a huge magnitude in every dimension -
    // if generation filtering were broken, this would dominate every result).
    await pool.query(
      `INSERT INTO embeddings (resource_id, generation_id, kind, text, vector)
       VALUES ($1, $2, 'resource', 'stale poisoned vector', $3)`,
      [staleRow.rows[0].id, staleGen.rows[0].id, pgvector.toSql(new Array(model.dimension).fill(1000))],
    );

    const results = await denseSearch(pool, model, 'weather forecast');
    const resourceIds = results.map((r) => r.resourceId);
    expect(resourceIds).toContain(
      (await pool.query(`SELECT id FROM resources WHERE resource = 'https://a.example.com/current-gen'`))
        .rows[0].id,
    );
    expect(resourceIds).not.toContain(staleRow.rows[0].id);
  });

  it('a paraphrase query with no vocabulary overlap with the resource surfaces it via a synthetic query embedding', async () => {
    // Deliberately vocabulary-free of the topic keywords in its own metadata.
    await catalog.add(
      {
        resource: 'https://a.example.com/atmos',
        type: 'http',
        x402Version: 2,
        accepts: [{ scheme: 'exact', network: 'stellar:testnet', payTo: 'G1', asset: 'native', amount: '1' }],
        serviceName: 'Atmos',
        description: 'Zephyr data stream',
      },
      'registered',
      'seed',
    );
    const resourceId = (
      await pool.query<{ id: number }>(`SELECT id FROM resources WHERE resource = 'https://a.example.com/atmos'`)
    ).rows[0].id;
    const generationId = await getOrCreateGeneration(pool, model);

    // The resource's own text has no weather-cluster vocabulary.
    const [ownVec] = await model.embed(['Atmos Zephyr data stream']);
    // A known, author-controlled synthetic query - what stage 2's synthetic
    // query generator is meant to eventually produce with real NL
    // generation; hand-authored here per the acceptance criteria ("a
    // fixture resource whose synthetic queries are known").
    const syntheticQueryText = 'climate outlook for the week';
    const [syntheticVec] = await model.embed([syntheticQueryText]);

    await pool.query(
      `INSERT INTO embeddings (resource_id, generation_id, kind, text, vector) VALUES ($1,$2,'resource',$3,$4)`,
      [resourceId, generationId, 'Atmos Zephyr data stream', pgvector.toSql(ownVec)],
    );
    await pool.query(
      `INSERT INTO embeddings (resource_id, generation_id, kind, text, vector) VALUES ($1,$2,'synthetic_query',$3,$4)`,
      [resourceId, generationId, syntheticQueryText, pgvector.toSql(syntheticVec)],
    );

    // Query shares no vocabulary with "Atmos Zephyr data stream" at all.
    const results = await denseSearch(pool, model, 'climate outlook');
    const match = results.find((r) => r.resourceId === resourceId);
    expect(match).toBeDefined();
    expect(match?.matchedKind).toBe('synthetic_query');
  });

  it('a worker crash mid-batch does not lose the job: a second claim after lease expiry picks it up', async () => {
    await catalog.add(
      {
        resource: 'https://a.example.com/crash-test',
        type: 'http',
        x402Version: 2,
        accepts: [{ scheme: 'exact', network: 'stellar:testnet', payTo: 'G1', asset: 'native', amount: '1' }],
        serviceName: 'CrashTest',
      },
      'registered',
      'seed',
    );

    // Worker A claims the job (simulating the start of processing) and then
    // "crashes" - never calls markDone/markFailed.
    const firstClaim = await claimBatch(pool, 10);
    expect(firstClaim).toHaveLength(1);

    // While the lease is still live, a second worker must NOT be able to
    // claim the same job - it's genuinely in flight, not abandoned yet.
    const stillLeased = await claimBatch(pool, 10);
    expect(stillLeased).toHaveLength(0);

    // Simulate the lease expiring (what would happen naturally after
    // LEASE_DURATION_MS if worker A really had crashed).
    await pool.query(`UPDATE embedding_jobs SET next_attempt_at = now() - interval '1 second' WHERE id = $1`, [
      firstClaim[0].id,
    ]);

    // A second worker instance now picks up the abandoned job - it isn't lost.
    const secondClaim = await claimBatch(pool, 10);
    expect(secondClaim).toHaveLength(1);
    expect(secondClaim[0].id).toBe(firstClaim[0].id);
  });

  it('concurrent claims from multiple worker instances never claim the same job twice', async () => {
    for (let i = 0; i < 6; i++) {
      await catalog.add(
        {
          resource: `https://a.example.com/concurrent-${i}`,
          type: 'http',
          x402Version: 2,
          accepts: [{ scheme: 'exact', network: 'stellar:testnet', payTo: 'G1', asset: 'native', amount: '1' }],
          serviceName: `Concurrent ${i}`,
        },
        'registered',
        'seed',
      );
    }
    const [batchA, batchB] = await Promise.all([claimBatch(pool, 6), claimBatch(pool, 6)]);
    const idsA = new Set(batchA.map((j) => j.id));
    const idsB = new Set(batchB.map((j) => j.id));
    const overlap = [...idsA].filter((id) => idsB.has(id));
    expect(overlap).toHaveLength(0);
    expect(idsA.size + idsB.size).toBe(6);
  });
});

describe('[MODEL] real local embedding model: paraphrase retrieval actually works', () => {
  // Uses the real local model (no network beyond the one-time cache-warm
  // download - see src/search/embedding-model.ts), not the fake. Slower
  // (model load), hence its own block and a longer timeout, kept separate
  // from the fast plumbing tests above so the common path doesn't pay this
  // cost on every run.
  let catalog: Catalog;
  let pool: pg.Pool;
  const model = localEmbeddingModel();

  beforeAll(async () => {
    catalog = await Catalog.connect(testDatabaseUrl());
    pool = testPool();
    // warm the model once so the actual assertions below aren't timing the load
    await model.embed(['warmup']);
  }, 60_000);

  afterAll(async () => {
    await catalog?.close();
    await pool?.end();
  });

  beforeEach(async () => {
    await resetDb();
  });

  it(
    'a real paraphrase query with no shared vocabulary still surfaces the right resource via the worker-embedded synthetic queries',
    async () => {
      await catalog.add(
        {
          resource: 'https://a.example.com/real-weather',
          type: 'http',
          x402Version: 2,
          accepts: [
            { scheme: 'exact', network: 'stellar:testnet', payTo: 'G1', asset: 'native', amount: '1' },
          ],
          serviceName: 'SkyCast',
          description: 'Hourly precipitation and temperature predictions for any city',
        },
        'registered',
        'seed',
      );
      await catalog.add(
        {
          resource: 'https://a.example.com/real-finance',
          type: 'http',
          x402Version: 2,
          accepts: [
            { scheme: 'exact', network: 'stellar:testnet', payTo: 'G2', asset: 'native', amount: '1' },
          ],
          serviceName: 'TickerPulse',
          description: 'Real-time equity price and trading volume feed',
        },
        'registered',
        'seed',
      );
      const stats = await runWorkerOnce(pool, model);
      expect(stats.succeeded).toBe(2);

      // No literal vocabulary overlap with "SkyCast" / "precipitation and
      // temperature predictions" - a genuine paraphrase.
      const results = await denseSearch(pool, model, 'is it going to rain tomorrow where I live?');
      const weatherId = (
        await pool.query<{ id: number }>(
          `SELECT id FROM resources WHERE resource = 'https://a.example.com/real-weather'`,
        )
      ).rows[0].id;
      const financeId = (
        await pool.query<{ id: number }>(
          `SELECT id FROM resources WHERE resource = 'https://a.example.com/real-finance'`,
        )
      ).rows[0].id;

      const weatherRank = results.findIndex((r) => r.resourceId === weatherId);
      const financeRank = results.findIndex((r) => r.resourceId === financeId);
      expect(weatherRank).toBeGreaterThanOrEqual(0);
      expect(weatherRank).toBeLessThan(financeRank === -1 ? Infinity : financeRank);
    },
    60_000,
  );
});
