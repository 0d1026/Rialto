import type { CleanEntryInput } from '../../src/validation.js';

/**
 * Gauntlet fixtures - the integrity-check defects from the manual review,
 * kept as one fixture per defect so 01.gauntlet.spec.ts can assert each in
 * isolation. Each `resource` URL is unique so fixtures never collide when
 * inserted into the same catalog.
 */

export const CLEAN_RESOURCE: CleanEntryInput = {
  resource: 'https://weather.example.com/api/forecast',
  type: 'http',
  x402Version: 2,
  accepts: [
    {
      scheme: 'exact',
      network: 'stellar:testnet',
      payTo: 'GABCDEFTESTADDRESS',
      asset: 'native',
      amount: '1000000',
    },
  ],
  description: 'Weather forecast API',
  serviceName: 'WeatherCo',
  tags: ['weather', 'forecast'],
  routeTemplate: '/api/forecast',
};

export const OVERSIZED_SERVICE_NAME: CleanEntryInput = {
  ...CLEAN_RESOURCE,
  resource: 'https://a.example.com/api/oversized-name',
  serviceName: 'this-service-name-is-way-too-long-for-the-32-char-limit',
  tags: undefined,
  routeTemplate: undefined,
};

export const INVALID_TAG_LIST: CleanEntryInput = {
  ...CLEAN_RESOURCE,
  resource: 'https://a.example.com/api/bad-tags',
  serviceName: undefined,
  // one non-string, one oversized, one non-ASCII, one valid, one duplicate (case-insensitive)
  tags: [123 as unknown as string, 'x'.repeat(40), 'café', 'valid-tag', 'Valid-Tag'],
  routeTemplate: undefined,
};

export const LOOPBACK_ICON_URL: CleanEntryInput = {
  ...CLEAN_RESOURCE,
  resource: 'https://a.example.com/api/bad-icon',
  serviceName: undefined,
  tags: undefined,
  iconUrl: 'http://127.0.0.1:8080/evil.png',
  routeTemplate: undefined,
};

/** Plain path traversal - the case the naive "check after decode" bug misses only sometimes. */
export const PLAIN_TRAVERSAL_ROUTE_TEMPLATE: CleanEntryInput = {
  ...CLEAN_RESOURCE,
  resource: 'https://a.example.com/api/traversal-plain',
  serviceName: undefined,
  tags: undefined,
  routeTemplate: '/api/../../etc/passwd',
};

/**
 * Percent-encoded path traversal - decodes to the same `..` traversal as the
 * plain case above, but arrives on the wire looking clean. Distinct fixture
 * on purpose: this is the one that actually proves decode-before-check
 * ordering, not just that traversal is rejected somehow.
 */
export const ENCODED_TRAVERSAL_ROUTE_TEMPLATE: CleanEntryInput = {
  ...CLEAN_RESOURCE,
  resource: 'https://a.example.com/api/traversal-encoded',
  serviceName: undefined,
  tags: undefined,
  routeTemplate: '/api/%2e%2e/%2e%2e/etc/passwd',
};

/** Envelope-level defect: missing `accepts` entirely - a hard reject, not a soft-drop. */
export const INVALID_ENVELOPE: CleanEntryInput = {
  resource: 'https://a.example.com/api/invalid-envelope',
  type: 'http',
  x402Version: 2,
  accepts: [],
};

/** Multiple field-level defects at once, to prove drops are independent and complete. */
export const MULTI_DEFECT_RESOURCE: CleanEntryInput = {
  resource: 'https://a.example.com/api/multi-defect',
  type: 'http',
  x402Version: 2,
  accepts: CLEAN_RESOURCE.accepts,
  description: 'Has more than one bad field at once',
  serviceName: 'this-service-name-is-way-too-long-for-the-32-char-limit',
  iconUrl: 'http://127.0.0.1:8080/evil.png',
  routeTemplate: '/api/../../etc/passwd',
  tags: ['fine-tag'],
};

/**
 * Mirrors `@x402/extensions`' `DiscoveredHTTPResource` shape - what
 * `extractDiscoveryInfo` returns after server-extension enrichment, used
 * only by the routeTemplate regression test (08) to stand in for a real
 * discovered payment resource without depending on exact wire bytes.
 */
export const DISCOVERED_RESOURCE_WITH_ROUTE_TEMPLATE = {
  resourceUrl: 'https://weather.example.com/api/forecast/lagos',
  description: 'Weather forecast API',
  mimeType: 'application/json',
  serviceName: 'WeatherCo',
  tags: ['weather'],
  method: 'GET',
  routeTemplate: '/api/forecast/:city',
  x402Version: 2,
  discoveryInfo: { input: { type: 'http' as const } },
  extensions: undefined,
};

export const DISCOVERED_RESOURCE_WITHOUT_ROUTE_TEMPLATE = {
  ...DISCOVERED_RESOURCE_WITH_ROUTE_TEMPLATE,
  resourceUrl: 'https://weather.example.com/api/forecast/no-route-template',
  routeTemplate: undefined,
};
