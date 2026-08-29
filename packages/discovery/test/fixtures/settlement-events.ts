import type { SettlementEvent } from '@rialto/shared';

export const VALID_EVENT: SettlementEvent = {
  txHash: 'tx-valid-0001',
  network: 'stellar:testnet',
  scheme: 'exact',
  payTo: 'GABCDEFTESTADDRESS',
  amount: '1000000',
  asset: 'native',
  resource: 'https://weather.example.com/api/forecast',
  settledAt: '2026-08-12T06:00:00.000Z',
  bazaarMetadata: {
    type: 'http',
    x402Version: 2,
    description: 'Weather forecast API',
    serviceName: 'WeatherCo',
    tags: ['weather', 'forecast'],
    routeTemplate: '/api/forecast',
  },
};

/** No bazaarMetadata: acknowledged by discovery, nothing should be cataloged. */
export const EVENT_WITHOUT_BAZAAR_METADATA: SettlementEvent = {
  txHash: 'tx-no-metadata-0001',
  network: 'stellar:testnet',
  scheme: 'exact',
  payTo: 'GABCDEFTESTADDRESS',
  amount: '500000',
  asset: 'native',
  resource: 'https://plain.example.com/api/data',
  settledAt: '2026-08-12T06:01:00.000Z',
};

/** Second settlement for the same resource - should upsert the existing row, not duplicate it. */
export const REPEAT_SETTLEMENT_EVENT: SettlementEvent = {
  ...VALID_EVENT,
  txHash: 'tx-valid-0002',
  settledAt: '2026-08-12T06:05:00.000Z',
  bazaarMetadata: {
    ...VALID_EVENT.bazaarMetadata!,
    description: 'Weather forecast API (updated description)',
  },
};

/** A second, distinct resource - used where a test needs more than one catalog entry. */
export const SECOND_VALID_EVENT: SettlementEvent = {
  txHash: 'tx-valid-0003',
  network: 'stellar:testnet',
  scheme: 'exact',
  payTo: 'GSECONDTESTADDRESS',
  amount: '250000',
  asset: 'native',
  resource: 'https://stocks.example.com/api/ticker',
  settledAt: '2026-08-12T06:02:00.000Z',
  bazaarMetadata: {
    type: 'http',
    x402Version: 2,
    description: 'Live stock ticker API',
    serviceName: 'StockTicker',
    tags: ['finance', 'stocks'],
  },
};

/** Same resource as VALID_EVENT but a different payTo and forged metadata - the listing-hijack case ownership binding must refuse. */
export const HIJACK_EVENT: SettlementEvent = {
  txHash: 'tx-hijack-0001',
  network: 'stellar:testnet',
  scheme: 'exact',
  payTo: 'GATTACKERADDRESS',
  amount: '1',
  asset: 'native',
  resource: VALID_EVENT.resource,
  settledAt: '2026-08-12T06:10:00.000Z',
  bazaarMetadata: {
    type: 'http',
    x402Version: 2,
    description: 'PAY HERE - cheapest weather',
    serviceName: 'WeatherCo',
    tags: ['weather', 'forecast'],
  },
};

/** Structurally malformed: missing required fields entirely - should be hard-rejected. */
export const MALFORMED_EVENT = {
  txHash: 'tx-malformed-0001',
  // network, scheme, payTo, amount, asset, resource, settledAt all missing
};
