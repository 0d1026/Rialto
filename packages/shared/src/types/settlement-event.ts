import type { BazaarMetadata } from './bazaar-metadata.js';

/**
 * What the facilitator POSTs to DISCOVERY_INGEST_URL after every successful
 * settlement. HTTP, fire-and-forget: if discovery is down, settlement still
 * succeeded - cataloging is delayed or missed for that payment, by design.
 */
export interface SettlementEvent {
  txHash: string;
  network: 'stellar:testnet' | 'stellar:pubnet';
  scheme: string;
  payTo: string;
  amount: string;
  asset: string;
  /** The URL that was paid for. */
  resource: string;
  /** Present only if the payment payload carried the bazaar extension. */
  bazaarMetadata?: BazaarMetadata;
  /** ISO timestamp. */
  settledAt: string;
}
