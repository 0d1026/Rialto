import type { ClientStellarSigner } from "@x402/stellar";

/**
 * Rialto's signer boundary for Stellar/Soroban payments - deliberately an
 * alias of @x402/stellar's own ClientStellarSigner (SEP-43 shaped: address +
 * signAuthEntry + optional signTransaction), not a bespoke interface.
 *
 * This IS the interface Freighter and other Soroban wallets already
 * implement (see @stellar/stellar-sdk/contract's `Signer` type docstring:
 * "an existing wallet object becomes a Signer by gaining an address...
 * matches signTransaction/signAuthEntry from Freighter"), and it's what
 * ExactStellarScheme's constructor already accepts. Every scheme builder
 * and payment-flow.ts depend on this name, never a concrete signer
 * implementation - see docs/decisions/0003-signer-boundary.md for the
 * KeypairSigner-today / wallet-signer-later split this enables.
 */
export type Signer = ClientStellarSigner;
