import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Catalog } from '../../src/catalog.js';
import { createApp } from '../../src/app.js';
import { resetDb, testDatabaseUrl } from '../setup/db.js';

/**
 * Current lexical implementation (Postgres FTS + ILIKE fallback), written
 * in terms of observable behavior rather than the scoring function, so
 * these survive the BM25 migration unchanged - only the ranking mechanism
 * underneath is expected to change, not these properties.
 */
describe('discovery/search: lexical ranking behavior', () => {
  let catalog: Catalog;

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
        resource: 'https://a.example.com/weather-co',
        type: 'http',
        x402Version: 2,
        accepts: [{ scheme: 'exact', network: 'stellar:testnet', payTo: 'G1', asset: 'native', amount: '1' }],
        serviceName: 'WeatherCo',
        description: 'Real-time weather forecast API for global cities',
        tags: ['weather'],
      },
      'registered',
      'seed',
    );
    await catalog.add(
      {
        resource: 'https://a.example.com/stock-ticker',
        type: 'http',
        x402Version: 2,
        accepts: [{ scheme: 'exact', network: 'stellar:testnet', payTo: 'G2', asset: 'native', amount: '2' }],
        serviceName: 'StockTicker',
        description: 'Live stock market data feed',
        tags: ['finance'],
      },
      'registered',
      'seed',
    );
    // matches "weather" only in the (lower-weighted) description field, not serviceName/tags
    await catalog.add(
      {
        resource: 'https://a.example.com/data-feed',
        type: 'http',
        x402Version: 2,
        accepts: [{ scheme: 'exact', network: 'stellar:testnet', payTo: 'G3', asset: 'native', amount: '3' }],
        serviceName: 'DataFeed',
        description: 'Comprehensive weather reporting and forecasting service',
        tags: [],
      },
      'registered',
      'seed',
    );
  });

  it('a query matching serviceName or description returns that resource', async () => {
    const app = createApp(catalog, {});
    const res = await request(app).get('/discovery/search').query({ query: 'stock market' });
    expect(res.status).toBe(200);
    const resources = res.body.resources.map((r: { resource: string }) => r.resource);
    expect(resources).toContain('https://a.example.com/stock-ticker');
  });

  it('a query matching nothing returns an empty result set, not an error', async () => {
    const app = createApp(catalog, {});
    const res = await request(app).get('/discovery/search').query({ query: 'nonexistent-zzz-term' });
    expect(res.status).toBe(200);
    expect(res.body.resources).toEqual([]);
  });

  it('among multiple matches, the more textually relevant result ranks first', async () => {
    const app = createApp(catalog, {});
    const res = await request(app).get('/discovery/search').query({ query: 'weather' });
    expect(res.status).toBe(200);
    const resources = res.body.resources.map((r: { resource: string }) => r.resource);
    expect(resources).toContain('https://a.example.com/weather-co');
    expect(resources).toContain('https://a.example.com/data-feed');
    // serviceName match (weight A) outranks a description-only match (weight B)
    const weatherCoIndex = resources.indexOf('https://a.example.com/weather-co');
    const dataFeedIndex = resources.indexOf('https://a.example.com/data-feed');
    expect(weatherCoIndex).toBeLessThan(dataFeedIndex);
  });

  it('a short/partial query still returns results via the ILIKE fallback', async () => {
    const app = createApp(catalog, {});
    // a substring that does not align to a word/lexeme boundary, so FTS tokenization
    // alone would miss it - only the ILIKE fallback on service_name catches this
    const res = await request(app).get('/discovery/search').query({ query: 'eatherC' });
    expect(res.status).toBe(200);
    const resources = res.body.resources.map((r: { resource: string }) => r.resource);
    expect(resources).toContain('https://a.example.com/weather-co');
  });
});
