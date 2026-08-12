/**
 * The exact scheme - wraps @x402/stellar's facilitator implementation.
 * We compose the canonical package; we do not reimplement verify/settle.
 * Single-signer by default; SDF's channel-accounts pattern (N parallel
 * settlements + dedicated fee-bump signer) activates via config.
 */

import { createEd25519Signer } from '@x402/stellar';
import { ExactStellarScheme } from '@x402/stellar/exact/facilitator';
import { Env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export function createExactScheme(): ExactStellarScheme {
  const rpcConfig = { url: Env.stellarRpcUrl };
  const maxTransactionFeeStroops = Env.maxTransactionFeeStroops;

  const useChannels =
    Env.feeBumpSecret && Env.channelSecrets && Env.channelSecrets.length > 0;

  if (useChannels) {
    const channelSigners = Env.channelSecrets!.map((s) => createEd25519Signer(s));
    const feeBumpSigner = createEd25519Signer(Env.feeBumpSecret!);
    logger.info(
      { feeBumpAddress: feeBumpSigner.address, channelCount: channelSigners.length },
      'exact scheme: high-throughput mode (fee-bump signer + channel accounts)',
    );
    return new ExactStellarScheme(channelSigners, {
      feeBumpSigner,
      rpcConfig,
      maxTransactionFeeStroops,
    });
  }

  const signer = createEd25519Signer(Env.stellarPrivateKey);
  logger.info({ address: signer.address }, 'exact scheme: single-signer mode');
  return new ExactStellarScheme([signer], { rpcConfig, maxTransactionFeeStroops });
}
