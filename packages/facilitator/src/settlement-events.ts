/**
 * SettlementEvent POST to discovery (DISCOVERY_INGEST_URL) after every
 * successful settle - the ONLY coupling between the facilitator and the
 * discovery layer. Fire-and-forget with a short timeout: if discovery is
 * down, settlement already succeeded; cataloging is delayed or missed for
 * that payment, by design.
 */

import type { PaymentPayload, PaymentRequirements } from '@x402/core/types';
import { extractDiscoveryInfo } from '@x402/extensions/bazaar';
import type { SettlementEvent, BazaarMetadata } from '@rialto/shared';
import { logger } from './utils/logger.js';

const POST_TIMEOUT_MS = 3_000;

/**
 * Canonical, validated extraction (@x402/extensions): returns null when the
 * payment carried no discovery extension or its info fails schema validation.
 */
export function extractBazaarMetadata(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): BazaarMetadata | undefined {
  let discovered;
  try {
    discovered = extractDiscoveryInfo(paymentPayload, paymentRequirements);
  } catch (err) {
    logger.warn({ err: String(err) }, 'discovery extraction failed (payment unaffected)');
    return undefined;
  }
  if (!discovered) return undefined;
  return {
    type: discovered.discoveryInfo.input.type,
    x402Version: discovered.x402Version,
    description: discovered.description,
    mimeType: discovered.mimeType,
    serviceName: discovered.serviceName,
    tags: discovered.tags,
    iconUrl: discovered.iconUrl,
    routeTemplate: 'routeTemplate' in discovered ? discovered.routeTemplate : undefined,
    toolName: 'toolName' in discovered ? discovered.toolName : undefined,
    extensions: discovered.extensions as Record<string, unknown> | undefined,
  };
}

export function postSettlementEvent(ingestUrl: string, event: SettlementEvent): void {
  if (!ingestUrl) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
  void fetch(ingestUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok) logger.warn({ status: res.status }, 'settlement event rejected by discovery');
    })
    .catch((err) => {
      logger.warn({ err: String(err) }, 'settlement event post failed (settlement unaffected)');
    })
    .finally(() => clearTimeout(timer));
}
