/**
 * Scheme registration point. @x402/core's x402Facilitator IS the registry -
 * register(network, scheme) accepts anything implementing its canonical
 * facilitator contract (ExactStellarScheme today; Favour's upto handler
 * registers here the same way once ready, without touching this plumbing).
 */

import { x402Facilitator } from '@x402/core/facilitator';
import { BAZAAR } from '@x402/extensions/bazaar';
import { Env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { createExactScheme } from './exact.js';

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

  facilitator.register(Env.stellarNetwork, createExactScheme());
  // upto: facilitator.register(Env.stellarNetwork, createUptoScheme()) - Favour's
  // handler lands here once his contract + handler are ready (freeze point 4).
  return facilitator;
}
