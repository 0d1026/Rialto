import { createEd25519Signer } from "@x402/stellar";
import type { Config } from "../../config.js";
import type { Signer } from "../signer.js";


export function createKeypairSigner(config: Config): Signer | undefined {
  if (!config.BUYER_STELLAR_PRIVATE_KEY) return undefined;
  return createEd25519Signer(config.BUYER_STELLAR_PRIVATE_KEY, config.NETWORK);
}
