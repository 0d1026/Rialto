/**
 * The exact scheme - wraps @x402/stellar's facilitator implementation.
 * We compose the canonical package; we do not reimplement verify/settle.
 * Single-signer by default; SDF's channel-accounts pattern (N parallel
 * settlements + dedicated fee-bump signer) activates via config.
 */

import { ExactStellarScheme } from '@x402/stellar/exact/facilitator';
import { Env } from '../config/env.js';
import { createStellarSigningContext } from './signers.js';

export function createExactScheme(
  signing = createStellarSigningContext(),
): ExactStellarScheme {
  const rpcConfig = { url: Env.stellarRpcUrl };
  const maxTransactionFeeStroops = Env.maxTransactionFeeStroops;

  return new ExactStellarScheme(signing.signers, {
    feeBumpSigner: signing.feeBumpSigner,
    selectSigner: signing.selectSigner,
    rpcConfig,
    maxTransactionFeeStroops,
  });
}
