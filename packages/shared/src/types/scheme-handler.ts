/**
 * The scheme plug-in point. Deliberately NOT a new interface: @x402/core's
 * x402Facilitator.register(network, scheme) is already the registry, and its
 * SchemeNetworkFacilitator contract is what ExactStellarScheme implements.
 * A new scheme (upto) implements the same canonical contract and registers
 * the same way - wire behavior stays canonical by construction.
 */
export type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
} from '@x402/core/types';
