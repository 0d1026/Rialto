import {
  createEd25519Signer,
  type FacilitatorStellarSigner,
} from '@x402/stellar';
import { Env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface StellarSigningContext {
  signers: FacilitatorStellarSigner[];
  feeBumpSigner?: FacilitatorStellarSigner;
  selectSigner: (addresses: readonly string[]) => string;
}

/**
 * Build the Stellar signing pool once so every registered scheme shares the
 * same round-robin cursor instead of independently selecting the same channel.
 */
export function createStellarSigningContext(): StellarSigningContext {
  const useChannels =
    Env.feeBumpSecret && Env.channelSecrets && Env.channelSecrets.length > 0;

  const signers = useChannels
    ? Env.channelSecrets!.map((secret) => createEd25519Signer(secret))
    : [createEd25519Signer(Env.stellarPrivateKey)];
  const feeBumpSigner = useChannels
    ? createEd25519Signer(Env.feeBumpSecret!)
    : undefined;

  let index = 0;
  const selectSigner = (addresses: readonly string[]): string => {
    if (addresses.length === 0) throw new Error('No Stellar facilitator signer available');
    return addresses[index++ % addresses.length];
  };

  if (feeBumpSigner) {
    logger.info(
      { feeBumpAddress: feeBumpSigner.address, channelCount: signers.length },
      'stellar schemes: high-throughput mode (fee-bump signer + channel accounts)',
    );
  } else {
    logger.info({ address: signers[0].address }, 'stellar schemes: single-signer mode');
  }

  return { signers, feeBumpSigner, selectSigner };
}
