import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Catalog } from '../../src/catalog.js';
import { createApp } from '../../src/app.js';
import { fakeEmbeddingModel } from '../setup/fake-embedding-model.js';
import { resetDb, testDatabaseUrl } from '../setup/db.js';

/**
 * regression: AND-only multi-word candidate selection returns nothing for
 * a natural-language query that only partially matches a resource's text.
 *
 * websearch_to_tsquery ANDs bare multi-word queries by default, so
 * "weather service" against a resource that only says "Weather API"
 * (shares "weather", not "service") produced zero SQL rows before BM25
 * ever ran - not a ranking problem, the candidate never entered the
 * pipeline. lexical.ts now retries with OR semantics whenever the strict
 * AND interpretation finds literally nothing, so a resource matching even
 * one query word is still surfaced, ranked by BM25 as usual. The retry
 * only fires on a genuine zero-result case - a query that already finds
 * something via the strict interpretation is never re-run or re-ranked.
 */
describe('lexical AND -> OR fallback: a partial-word-match query still finds a resource', () => {
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
    await catalog.add(
      {
        resource: 'https://a.example.com/weather-api',
        type: 'http',
        x402Version: 2,
        accepts: [{ scheme: 'exact', network: 'stellar:testnet', payTo: 'G1', asset: 'native', amount: '1' }],
        serviceName: 'Weather API',
        description: 'Current conditions and forecasts',
      },
      'registered',
      'seed',
    );
    await catalog.add(
      {
        resource: 'https://a.example.com/ticket-booking',
        type: 'http',
        x402Version: 2,
        accepts: [{ scheme: 'exact', network: 'stellar:testnet', payTo: 'G2', asset: 'native', amount: '1' }],
        serviceName: 'Ticket Booking',
        description: 'Reserve seats for live events',
      },
      'registered',
      'seed',
    );
  });

  it('the reported case: "weather service" finds "Weather API" instead of returning nothing', async () => {
    const app = createApp(catalog, { embeddingModel: model });
    const res = await request(app).get('/discovery/search').query({ query: 'weather service' });
    expect(res.status).toBe(200);
    const resources = res.body.resources.map((r: { resource: string }) => r.resource);
    expect(resources).toContain('https://a.example.com/weather-api');
    expect(resources).not.toContain('https://a.example.com/ticket-booking');
  });

  it('a query where none of the words match anything still returns empty, not every resource', async () => {
    const app = createApp(catalog, { embeddingModel: model });
    const res = await request(app).get('/discovery/search').query({ query: 'astrology telescope' });
    expect(res.status).toBe(200);
    expect(res.body.resources).toEqual([]);
  });

  it('a single-word zero-match query stays empty (nothing to OR against)', async () => {
    const app = createApp(catalog, { embeddingModel: model });
    const res = await request(app).get('/discovery/search').query({ query: 'astrology' });
    expect(res.status).toBe(200);
    expect(res.body.resources).toEqual([]);
  });

  it('a query that already matches everything via strict AND is unaffected by the fallback', async () => {
    const app = createApp(catalog, { embeddingModel: model });
    const res = await request(app).get('/discovery/search').query({ query: 'weather api' });
    expect(res.status).toBe(200);
    const resources = res.body.resources.map((r: { resource: string }) => r.resource);
    expect(resources).toEqual(['https://a.example.com/weather-api']);
  });

  it('a partially-matching query with two resources ranks the better match first (BM25 still applies to fallback candidates)', async () => {
    const app = createApp(catalog, { embeddingModel: model });
    // "weather" matches only weather-api; "booking" matches only ticket-booking.
    // Neither resource contains both words, so this only returns anything at
    // all because of the OR fallback - and each resource should still rank
    // by its own genuine term match, not an arbitrary order.
    const res = await request(app).get('/discovery/search').query({ query: 'weather booking' });
    expect(res.status).toBe(200);
    const resources = res.body.resources.map((r: { resource: string }) => r.resource);
    expect(resources).toEqual(
      expect.arrayContaining(['https://a.example.com/weather-api', 'https://a.example.com/ticket-booking']),
    );
    expect(resources).toHaveLength(2);
  });
});
