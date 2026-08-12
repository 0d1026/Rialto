import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentPayload, PaymentRequirements } from '@x402/core/types';
import { Catalog } from '../../src/catalog.js';
import { createApp } from '../../src/app.js';
import { resetDb, testDatabaseUrl } from '../setup/db.js';
import {
  DISCOVERED_RESOURCE_WITH_ROUTE_TEMPLATE,
  DISCOVERED_RESOURCE_WITHOUT_ROUTE_TEMPLATE,
} from '../fixtures/resources.js';

/**
 * regression: routeTemplate silently dropped from cataloged metadata
 *
 * Manual review finding: packages/facilitator/src/settlement-events.ts'
 * `extractBazaarMetadata` builds the BazaarMetadata it POSTs to discovery
 * field-by-field, and never copies `routeTemplate` off what
 * `extractDiscoveryInfo` (from @x402/extensions) returns - even though that
 * field is real, populated after server-extension enrichment, and discovery
 * has a whole sanitization path built for it (percent-decode-before-
 * traversal-check in validation.ts, a dedicated DB column, wire
 * serialization). Net effect: every real settlement catalogs with
 * routeTemplate silently absent.
 *
 * This test calls the actual, unmodified `extractBazaarMetadata` from
 * @rialto/facilitator (not a reimplementation in this package - a
 * reimplementation could drift from the real bug and never catch the real
 * fix), mocking only `extractDiscoveryInfo` itself so the test doesn't need
 * to hand-construct exact x402 wire bytes to get a populated routeTemplate
 * out of the real library. It should fail today and flip green the moment
 * someone adds `routeTemplate: discovered.routeTemplate` to that function -
 * at which point this stays in the suite as the permanent regression guard.
 */

vi.mock('@x402/extensions/bazaar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@x402/extensions/bazaar')>();
  return {
    ...actual,
    extractDiscoveryInfo: vi.fn(),
  };
});

const FAKE_PAYLOAD = {} as PaymentPayload;
const FAKE_REQUIREMENTS = {} as PaymentRequirements;

describe('[integration] regression: routeTemplate silently dropped from cataloged metadata', () => {
  let catalog: Catalog;

  beforeAll(async () => {
    catalog = await Catalog.connect(testDatabaseUrl());
  });

  afterAll(async () => {
    await catalog?.close();
  });

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
  });

  it('a discovered resource with a populated routeTemplate ends up on the cataloged entry', async () => {
    const { extractDiscoveryInfo } = await import('@x402/extensions/bazaar');
    vi.mocked(extractDiscoveryInfo).mockReturnValue(
      DISCOVERED_RESOURCE_WITH_ROUTE_TEMPLATE as never,
    );
    const { extractBazaarMetadata } = await import('@rialto/facilitator/src/settlement-events.js');

    const metadata = extractBazaarMetadata(FAKE_PAYLOAD, FAKE_REQUIREMENTS);
    // This is the assertion that fails against today's code: extractBazaarMetadata
    // never copies discovered.routeTemplate, so metadata.routeTemplate is undefined
    // even though DISCOVERED_RESOURCE_WITH_ROUTE_TEMPLATE.routeTemplate is set.
    expect(metadata?.routeTemplate).toBe(DISCOVERED_RESOURCE_WITH_ROUTE_TEMPLATE.routeTemplate);

    const app = createApp(catalog, {});
    const res = await request(app)
      .post('/internal/settlement-events')
      .send({
        txHash: 'tx-route-template-regression',
        network: 'stellar:testnet',
        scheme: 'exact',
        payTo: 'GROUTETEMPLATE',
        amount: '1',
        asset: 'native',
        resource: DISCOVERED_RESOURCE_WITH_ROUTE_TEMPLATE.resourceUrl,
        settledAt: '2026-08-12T06:10:00.000Z',
        bazaarMetadata: metadata,
      });
    expect(res.status).toBe(202);

    const { items } = await catalog.list({ limit: 10, offset: 0 });
    const row = items[0] as Record<string, unknown>;
    expect(row.routeTemplate).toBe(DISCOVERED_RESOURCE_WITH_ROUTE_TEMPLATE.routeTemplate);
  });

  it('a discovered resource with no routeTemplate catalogs with the field absent, not an empty string', async () => {
    const { extractDiscoveryInfo } = await import('@x402/extensions/bazaar');
    vi.mocked(extractDiscoveryInfo).mockReturnValue(
      DISCOVERED_RESOURCE_WITHOUT_ROUTE_TEMPLATE as never,
    );
    const { extractBazaarMetadata } = await import('@rialto/facilitator/src/settlement-events.js');

    const metadata = extractBazaarMetadata(FAKE_PAYLOAD, FAKE_REQUIREMENTS);
    expect(metadata?.routeTemplate).toBeUndefined();

    const app = createApp(catalog, {});
    await request(app)
      .post('/internal/settlement-events')
      .send({
        txHash: 'tx-route-template-absent',
        network: 'stellar:testnet',
        scheme: 'exact',
        payTo: 'GROUTETEMPLATE',
        amount: '1',
        asset: 'native',
        resource: DISCOVERED_RESOURCE_WITHOUT_ROUTE_TEMPLATE.resourceUrl,
        settledAt: '2026-08-12T06:11:00.000Z',
        bazaarMetadata: metadata,
      })
      .expect(202);

    const { items } = await catalog.list({ limit: 10, offset: 0 });
    const row = items[0] as Record<string, unknown>;
    expect(row.routeTemplate).toBeUndefined();
    expect(row.routeTemplate).not.toBe('');
  });
});
