/**
 * Scheme registration point. @x402/core's x402Facilitator IS the registry -
 * register(network, scheme) accepts anything implementing its canonical
 * facilitator contract. Exact is always registered; upto is opt-in through
 * its canonical settlement-contract configuration.
 */

import { x402Facilitator } from '@x402/core/facilitator';
import { BAZAAR } from '@x402/extensions/bazaar';
import { Env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { createExactScheme } from './exact.js';
import { createStellarSigningContext } from './signers.js';
import { createUptoScheme } from './upto.js';

export function buildFacilitator(): x402Facilitator {
  const facilitator = new x402Facilitator()
    .registerExtension(BAZAAR)
    .onVerifyFailure(async (context) => {
      const reason =
        context.error instanceof Error ? context.error.message : String(context.error ?? '');
      logger.warn({ reason }, 'verify failure');
    })
    .onSettleFailure(async (context) => {
      const reason =
        context.error instanceof Error ? context.error.message : String(context.error ?? '');
      logger.warn({ reason }, 'settle failure');
    });

  const signing = createStellarSigningContext();
  facilitator.register(Env.stellarNetwork, createExactScheme(signing));
  if (Env.uptoSettlementContract) {
    facilitator.register(Env.stellarNetwork, createUptoScheme(signing));
  }
  return facilitator;
}
