import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from '@x402/core/types';
import {
  Address,
  BASE_FEE,
  Operation,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import {
  getEstimatedLedgerCloseTimeSeconds,
  getNetworkPassphrase,
  getRpcClient,
  isStellarNetwork,
  validateStellarAssetAddress,
  type FacilitatorStellarSigner,
  type RpcConfig,
} from '@x402/stellar';
import { Env } from '../config/env.js';
import type { StellarSigningContext } from './signers.js';

const SUPPORTED_X402_VERSION = 2;
const DEFAULT_LEDGER_SECONDS = 5;
const INCLUSION_BUFFER_STROOPS = Number(BASE_FEE);
const UNEXPECTED_SETTLE_ERROR = 'unexpected_settle_error';
const I128_MAX = (1n << 127n) - 1n;

export const UPTO_ERROR_CODES = {
  notYetValid: 'invalid_upto_stellar_settlement_not_yet_valid',
  expired: 'invalid_upto_stellar_settlement_expired',
  exceedsAmount: 'invalid_upto_stellar_settlement_exceeds_amount',
  negativeAmount: 'invalid_upto_stellar_settlement_negative_amount',
  invalidMaxAmount: 'invalid_upto_stellar_payload_invalid_max_amount',
  accountAuthentication: 'invalid_upto_stellar_account_authentication',
  feeExceedsMaximum: 'invalid_upto_stellar_payload_fee_exceeds_maximum',
  allowanceRequired: 'UPTO_ALLOWANCE_REQUIRED',
} as const;

type Phase = 'verify' | 'settle';
type RpcClient = Pick<
  rpc.Server,
  | 'getAccount'
  | 'getLatestLedger'
  | 'simulateTransaction'
  | 'sendTransaction'
  | 'getTransaction'
>;

interface UptoWirePayload {
  from: string;
  payTo: string;
  asset: string;
  maxAmount: string;
  maxAmountValue: bigint;
  validAfter: number;
  deadline: number;
  expirationLedger: number;
  salt: Buffer;
  autoRevoke: boolean;
  authEntry: xdr.SorobanAuthorizationEntry;
}

interface PreparedSimulation {
  payer: string;
  amount: bigint;
  amountString: string;
  network: Network;
  signer: FacilitatorStellarSigner;
  server: RpcClient;
  transaction: ReturnType<TransactionBuilder['build']>;
  simulation: rpc.Api.SimulateTransactionSuccessResponse;
}

interface PreparationFailure {
  response: VerifyResponse;
}

export interface UptoStellarSchemeOptions {
  network: Network;
  settlementContract: string;
  rpcConfig?: RpcConfig;
  maxTransactionFeeStroops?: number;
  feeBumpSigner?: FacilitatorStellarSigner;
  selectSigner?: (addresses: readonly string[]) => string;
  /** Test seams; production uses the canonical @x402/stellar helpers. */
  rpcClientFactory?: (network: Network, config?: RpcConfig) => RpcClient;
  estimatedLedgerSeconds?: (network: Network) => Promise<number>;
  pollDelayMs?: number;
}

function invalidVerifyResponse(
  reason: string,
  payer?: string,
  message?: string,
): VerifyResponse {
  return {
    isValid: false,
    invalidReason: reason,
    ...(message ? { invalidMessage: message } : {}),
    ...(payer ? { payer } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseIntegerString(value: unknown): bigint | undefined {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)$/.test(value)) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function isSafeUnsignedInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isStellarContractAddress(value: unknown): value is string {
  if (typeof value !== 'string' || !validateStellarAssetAddress(value)) return false;
  try {
    return Address.fromString(value).type === 'contract';
  } catch {
    return false;
  }
}

function scValEquals(actual: xdr.ScVal, expected: xdr.ScVal): boolean {
  return actual.toXDR('base64') === expected.toXDR('base64');
}

function contractInvocation(
  invocation: xdr.SorobanAuthorizedInvocation,
): xdr.InvokeContractArgs | undefined {
  const fn = invocation.function();
  if (fn.switch().name !== 'sorobanAuthorizedFunctionTypeContractFn') return undefined;
  return fn.contractFn();
}

function invocationMatches(
  invocation: xdr.SorobanAuthorizedInvocation,
  contract: string,
  fnName: string,
  expectedArgs: xdr.ScVal[],
): boolean {
  const call = contractInvocation(invocation);
  if (!call) return false;
  if (Address.fromScAddress(call.contractAddress()).toString() !== contract) return false;
  if (call.functionName().toString() !== fnName) return false;
  const args = call.args();
  return (
    args.length === expectedArgs.length &&
    args.every((arg, index) => scValEquals(arg, expectedArgs[index]))
  );
}

function getAddressCredentials(
  credentials: xdr.SorobanCredentials,
): xdr.SorobanAddressCredentials | undefined {
  switch (credentials.switch().name) {
    case 'sorobanCredentialsAddress':
      return credentials.address();
    case 'sorobanCredentialsAddressV2':
      return credentials.addressV2();
    case 'sorobanCredentialsAddressWithDelegates':
      return credentials.addressWithDelegates().addressCredentials();
    default:
      return undefined;
  }
}

function isAuthenticationFailure(error: string): boolean {
  const lower = error.toLowerCase();
  return [
    'auth',
    'signature',
    'credential',
    '__check_auth',
    'nonce',
  ].some((fragment) => lower.includes(fragment));
}

export class UptoStellarScheme implements SchemeNetworkFacilitator {
  readonly scheme = 'upto';
  readonly caipFamily = 'stellar:*';
  readonly signingAddresses: ReadonlySet<string>;
  readonly settlementContract: string;
  readonly maxTransactionFeeStroops: number;

  private readonly network: Network;
  private readonly signerMap: ReadonlyMap<string, FacilitatorStellarSigner>;
  private readonly feeBumpSigner?: FacilitatorStellarSigner;
  private readonly selectSigner: (addresses: readonly string[]) => string;
  private readonly rpcConfig?: RpcConfig;
  private readonly rpcClientFactory: (network: Network, config?: RpcConfig) => RpcClient;
  private readonly estimatedLedgerSeconds: (network: Network) => Promise<number>;
  private readonly pollDelayMs: number;

  constructor(signers: FacilitatorStellarSigner[], options: UptoStellarSchemeOptions) {
    if (signers.length === 0) throw new Error('At least one Stellar signer is required');
    if (!isStellarNetwork(options.network)) {
      throw new Error(`Unsupported Stellar network for upto: ${options.network}`);
    }
    if (!isStellarContractAddress(options.settlementContract)) {
      throw new Error('UPTO_SETTLEMENT_CONTRACT must be a Stellar contract C-address');
    }
    const ceiling = options.maxTransactionFeeStroops ?? 50_000;
    if (!Number.isSafeInteger(ceiling) || ceiling < INCLUSION_BUFFER_STROOPS) {
      throw new Error(
        `UPTO_MAX_TRANSACTION_FEE_STROOPS must be an integer >= ${INCLUSION_BUFFER_STROOPS}`,
      );
    }

    this.network = options.network;
    this.settlementContract = options.settlementContract;
    this.maxTransactionFeeStroops = ceiling;
    this.signerMap = new Map(signers.map((signer) => [signer.address, signer]));
    this.signingAddresses = new Set(this.signerMap.keys());
    this.feeBumpSigner = options.feeBumpSigner;
    this.selectSigner = options.selectSigner ?? ((addresses) => addresses[0]);
    this.rpcConfig = options.rpcConfig;
    this.rpcClientFactory = options.rpcClientFactory ?? getRpcClient;
    this.estimatedLedgerSeconds =
      options.estimatedLedgerSeconds ?? getEstimatedLedgerCloseTimeSeconds;
    this.pollDelayMs = options.pollDelayMs ?? 1_000;
  }

  getExtra(_network: Network): Record<string, unknown> {
    return {
      areFeesSponsored: true,
      settlementContract: this.settlementContract,
    };
  }

  getSigners(_network: string): string[] {
    const addresses = [...this.signingAddresses];
    if (this.feeBumpSigner && !this.signingAddresses.has(this.feeBumpSigner.address)) {
      addresses.push(this.feeBumpSigner.address);
    }
    return addresses;
  }

  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    try {
      const prepared = await this.prepare('verify', payload, requirements);
      if ('response' in prepared) return prepared.response;
      return { isValid: true, payer: prepared.payer };
    } catch (error) {
      return invalidVerifyResponse(
        'unexpected_verify_error',
        undefined,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    let payer: string | undefined;
    let amount: string | undefined;
    let transaction = '';
    try {
      const prepared = await this.prepare('settle', payload, requirements);
      if ('response' in prepared) {
        return {
          success: false,
          transaction,
          network: requirements.network,
          errorReason: prepared.response.invalidReason ?? 'verification_failed',
          ...(prepared.response.invalidMessage
            ? { errorMessage: prepared.response.invalidMessage }
            : {}),
          ...(prepared.response.payer ? { payer: prepared.response.payer } : {}),
        };
      }

      payer = prepared.payer;
      amount = prepared.amountString;
      const sorobanData = prepared.simulation.transactionData.build();
      const rebuilt = TransactionBuilder.cloneFrom(prepared.transaction, {
        fee: BASE_FEE,
        networkPassphrase: getNetworkPassphrase(prepared.network),
        sorobanData,
      }).build();
      this.assertSponsoredTransaction(rebuilt, prepared.signer.address);

      if (Number(rebuilt.fee) > this.maxTransactionFeeStroops) {
        return {
          success: false,
          transaction,
          network: prepared.network,
          payer,
          errorReason: UPTO_ERROR_CODES.feeExceedsMaximum,
          errorMessage: `transaction fee ${rebuilt.fee} stroops exceeds ceiling ${this.maxTransactionFeeStroops} stroops`,
        };
      }

      const networkPassphrase = getNetworkPassphrase(prepared.network);
      const { signedTxXdr, error: signError } = await prepared.signer.signTransaction(
        rebuilt.toXDR(),
        { networkPassphrase },
      );
      if (signError) {
        return {
          success: false,
          transaction,
          network: prepared.network,
          payer,
          errorReason: UNEXPECTED_SETTLE_ERROR,
          errorMessage: 'Facilitator transaction signing failed',
        };
      }

      const signedTransaction = TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase);
      if (!(signedTransaction instanceof Transaction)) {
        throw new Error('Facilitator signer returned a fee-bump transaction unexpectedly');
      }
      let txToSubmit: Transaction | ReturnType<typeof TransactionBuilder.buildFeeBumpTransaction> =
        signedTransaction;
      if (this.feeBumpSigner) {
        const feeBump = TransactionBuilder.buildFeeBumpTransaction(
          this.feeBumpSigner.address,
          BASE_FEE,
          signedTransaction,
          networkPassphrase,
        );
        if (Number(feeBump.fee) > this.maxTransactionFeeStroops) {
          return {
            success: false,
            transaction,
            network: prepared.network,
            payer,
            errorReason: UPTO_ERROR_CODES.feeExceedsMaximum,
            errorMessage: `fee-bump transaction fee ${feeBump.fee} stroops exceeds ceiling ${this.maxTransactionFeeStroops} stroops`,
          };
        }
        const { signedTxXdr: feeBumpXdr, error: feeBumpError } =
          await this.feeBumpSigner.signTransaction(feeBump.toXDR(), {
            networkPassphrase,
          });
        if (feeBumpError) {
          return {
            success: false,
            transaction,
            network: prepared.network,
            payer,
            errorReason: UNEXPECTED_SETTLE_ERROR,
            errorMessage: 'Facilitator fee-bump signing failed',
          };
        }
        txToSubmit = TransactionBuilder.fromXDR(feeBumpXdr, networkPassphrase);
      }

      const sendResult = await prepared.server.sendTransaction(txToSubmit);
      if (sendResult.status !== 'PENDING') {
        return {
          success: false,
          transaction,
          network: prepared.network,
          payer,
          errorReason: UNEXPECTED_SETTLE_ERROR,
          errorMessage: `Transaction submission returned ${sendResult.status}`,
        };
      }

      transaction = sendResult.hash;
      const confirmed = await this.pollForTransaction(
        prepared.server,
        transaction,
        requirements.maxTimeoutSeconds,
      );
      if (!confirmed) {
        return {
          success: false,
          transaction,
          network: prepared.network,
          payer,
          errorReason: UNEXPECTED_SETTLE_ERROR,
          errorMessage: 'Settlement transaction failed or timed out',
        };
      }

      return {
        success: true,
        transaction,
        network: prepared.network,
        payer,
        amount,
      };
    } catch (error) {
      return {
        success: false,
        transaction,
        network: requirements.network,
        ...(payer ? { payer } : {}),
        errorReason: UNEXPECTED_SETTLE_ERROR,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private parsePayload(payload: PaymentPayload): UptoWirePayload | VerifyResponse {
    if (!isRecord(payload.payload)) {
      return invalidVerifyResponse('payload_invalid', undefined, 'upto payload must be an object');
    }
    const value = payload.payload;
    const from = value.from;
    const payTo = value.payTo;
    const asset = value.asset;
    const maxAmount = value.maxAmount;
    const validAfter = value.validAfter;
    const deadline = value.deadline;
    const expirationLedger = value.expirationLedger;
    const salt = value.salt;
    const autoRevoke = value.autoRevoke;
    const authEntries = value.authEntries;

    if (typeof from !== 'string' || !/^[GC]/.test(from)) {
      return invalidVerifyResponse(
        'payload_invalid',
        undefined,
        'payload.from must be a Stellar G-account or C-account address',
      );
    }
    try {
      Address.fromString(from);
    } catch {
      return invalidVerifyResponse('payload_invalid', undefined, 'payload.from is invalid');
    }
    if (typeof payTo !== 'string') {
      return invalidVerifyResponse('payload_invalid', from, 'payload.payTo must be a Stellar address');
    }
    try {
      Address.fromString(payTo);
    } catch {
      return invalidVerifyResponse('payload_invalid', from, 'payload.payTo is invalid');
    }
    if (!isStellarContractAddress(asset)) {
      return invalidVerifyResponse(
        'payload_invalid',
        from,
        'upto supports SEP-41 Soroban token contract C-addresses only; classic Stellar assets are unsupported',
      );
    }

    const maxAmountValue = parseIntegerString(maxAmount);
    if (
      typeof maxAmount !== 'string' ||
      maxAmountValue === undefined ||
      maxAmountValue <= 0n ||
      maxAmountValue > I128_MAX
    ) {
      return invalidVerifyResponse(UPTO_ERROR_CODES.invalidMaxAmount, from);
    }
    if (!isSafeUnsignedInteger(validAfter) || !isSafeUnsignedInteger(deadline)) {
      return invalidVerifyResponse(
        'payload_invalid',
        from,
        'validAfter and deadline must be non-negative safe integer Unix timestamps',
      );
    }
    if (
      !isSafeUnsignedInteger(expirationLedger) ||
      expirationLedger > 0xffff_ffff
    ) {
      return invalidVerifyResponse(
        'payload_invalid',
        from,
        'expirationLedger must be an unsigned 32-bit integer',
      );
    }
    if (typeof salt !== 'string' || !/^[0-9a-fA-F]{64}$/.test(salt)) {
      return invalidVerifyResponse(
        'payload_invalid',
        from,
        'salt must be exactly 32 bytes encoded as 64 hexadecimal characters',
      );
    }
    if (typeof autoRevoke !== 'boolean') {
      return invalidVerifyResponse('payload_invalid', from, 'autoRevoke must be a boolean');
    }
    if (!Array.isArray(authEntries) || authEntries.length !== 1 || typeof authEntries[0] !== 'string') {
      return invalidVerifyResponse(
        'payload_invalid',
        from,
        'authEntries must contain exactly one base64 SorobanAuthorizationEntry',
      );
    }

    let authEntry: xdr.SorobanAuthorizationEntry;
    try {
      authEntry = xdr.SorobanAuthorizationEntry.fromXDR(authEntries[0], 'base64');
    } catch {
      return invalidVerifyResponse(
        'payload_invalid',
        from,
        'authEntries[0] is not valid Soroban authorization-entry XDR',
      );
    }

    return {
      from,
      payTo,
      asset,
      maxAmount,
      maxAmountValue,
      validAfter,
      deadline,
      expirationLedger,
      salt: Buffer.from(salt, 'hex'),
      autoRevoke,
      authEntry,
    };
  }

  private validateAuthTree(
    wire: UptoWirePayload,
    currentLedger: number,
    maximumLedger: number,
  ): VerifyResponse | undefined {
    const credentials = getAddressCredentials(wire.authEntry.credentials());
    if (!credentials) {
      return invalidVerifyResponse(
        'payload_invalid',
        wire.from,
        'source-account implicit authorization is not permitted for upto',
      );
    }

    let credentialAddress: string;
    try {
      credentialAddress = Address.fromScAddress(credentials.address()).toString();
      // Reading the nonce is intentional: decoding must include the protocol nonce field.
      credentials.nonce().toBigInt();
    } catch {
      return invalidVerifyResponse('payload_invalid', wire.from, 'authorization credentials are malformed');
    }
    if (credentialAddress !== wire.from) {
      return invalidVerifyResponse(
        'payload_invalid',
        wire.from,
        'authorization credential address does not match payload.from',
      );
    }
    if (credentials.signatureExpirationLedger() !== wire.expirationLedger) {
      return invalidVerifyResponse(
        'payload_invalid',
        wire.from,
        'signatureExpirationLedger must equal payload.expirationLedger',
      );
    }
    if (wire.expirationLedger < currentLedger || wire.expirationLedger > maximumLedger) {
      return invalidVerifyResponse(
        'payload_invalid',
        wire.from,
        `expirationLedger must be between current ledger ${currentLedger} and ${maximumLedger}`,
      );
    }

    const address = (value: string) => Address.fromString(value).toScVal();
    const i128 = (value: bigint) => nativeToScVal(value, { type: 'i128' });
    const u64 = (value: number) => nativeToScVal(BigInt(value), { type: 'u64' });
    const u32 = (value: number) => nativeToScVal(value, { type: 'u32' });

    const root = wire.authEntry.rootInvocation();
    const expectedRootArgs = [
      address(wire.payTo),
      address(wire.asset),
      i128(wire.maxAmountValue),
      u64(wire.validAfter),
      u64(wire.deadline),
      u32(wire.expirationLedger),
      nativeToScVal(wire.salt, { type: 'bytes' }),
      nativeToScVal(wire.autoRevoke),
    ];
    if (!invocationMatches(root, this.settlementContract, 'settle', expectedRootArgs)) {
      return invalidVerifyResponse(
        'payload_invalid',
        wire.from,
        'authorization root must be UptoSettlement.settle with the exact signed witness tuple and no amount',
      );
    }

    const subInvocations = root.subInvocations();
    const expectedCount = wire.autoRevoke ? 2 : 1;
    if (subInvocations.length !== expectedCount) {
      return invalidVerifyResponse(
        'payload_invalid',
        wire.from,
        `authorization root must contain exactly ${expectedCount} approve sub-invocation(s)`,
      );
    }
    const positiveApprove = [
      address(wire.from),
      address(this.settlementContract),
      i128(wire.maxAmountValue),
      u32(wire.expirationLedger),
    ];
    if (!invocationMatches(subInvocations[0], wire.asset, 'approve', positiveApprove)) {
      return invalidVerifyResponse(
        'payload_invalid',
        wire.from,
        'first authorization sub-invocation must approve maxAmount through expirationLedger',
      );
    }
    if (subInvocations[0].subInvocations().length !== 0) {
      return invalidVerifyResponse('payload_invalid', wire.from, 'approve authorization must be a leaf invocation');
    }
    if (wire.autoRevoke) {
      const revokeApprove = [
        address(wire.from),
        address(this.settlementContract),
        i128(0n),
        u32(0),
      ];
      if (!invocationMatches(subInvocations[1], wire.asset, 'approve', revokeApprove)) {
        return invalidVerifyResponse(
          'payload_invalid',
          wire.from,
          'second authorization sub-invocation must revoke the allowance with approve(0, 0)',
        );
      }
      if (subInvocations[1].subInvocations().length !== 0) {
        return invalidVerifyResponse('payload_invalid', wire.from, 'approve authorization must be a leaf invocation');
      }
    }
    return undefined;
  }

  private validateEvents(
    events: xdr.DiagnosticEvent[],
    wire: UptoWirePayload,
    expectedAmount: bigint,
  ): VerifyResponse | undefined {
    const transfers: Array<{ from: unknown; to: unknown; amount: unknown }> = [];
    for (const diagnostic of events) {
      if (!diagnostic.inSuccessfulContractCall()) continue;
      const event = diagnostic.event();
      if (event.type().name !== 'contract' || !event.contractId()) continue;

      const eventContract = Address.fromScAddress(
        xdr.ScAddress.scAddressTypeContract(event.contractId()!),
      ).toString();
      if (eventContract !== wire.asset) continue;

      const body = event.body().v0();
      const topics = body.topics();
      if (topics.length === 0 || topics[0].switch().name !== 'scvSymbol') {
        return invalidVerifyResponse('payload_invalid', wire.from, 'token simulation emitted a malformed event');
      }
      const symbol = topics[0].sym().toString();
      if (symbol === 'approve') continue;
      if (symbol !== 'transfer' || topics.length < 3) {
        return invalidVerifyResponse(
          'payload_invalid',
          wire.from,
          `token simulation emitted unexpected ${symbol} event`,
        );
      }
      transfers.push({
        from: scValToNative(topics[1]),
        to: scValToNative(topics[2]),
        amount: scValToNative(body.data()),
      });
    }

    if (expectedAmount === 0n) {
      if (transfers.length !== 0) {
        return invalidVerifyResponse('payload_invalid', wire.from, 'zero settlement must emit no transfer event');
      }
      return undefined;
    }
    if (transfers.length !== 1) {
      return invalidVerifyResponse(
        'payload_invalid',
        wire.from,
        'positive settlement must emit exactly one token transfer event',
      );
    }
    const transfer = transfers[0];
    if (
      transfer.from !== wire.from ||
      transfer.to !== wire.payTo ||
      transfer.amount !== expectedAmount
    ) {
      return invalidVerifyResponse(
        'payload_invalid',
        wire.from,
        'simulation transfer does not match the authorized payer, recipient, and amount',
      );
    }
    return undefined;
  }

  private async prepare(
    phase: Phase,
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<PreparedSimulation | PreparationFailure> {
    if (payload.x402Version !== SUPPORTED_X402_VERSION) {
      return { response: invalidVerifyResponse('invalid_x402_version') };
    }
    if (payload.accepted?.scheme !== 'upto' || requirements.scheme !== 'upto') {
      return { response: invalidVerifyResponse('unsupported_scheme') };
    }
    if (payload.accepted.network !== requirements.network) {
      return { response: invalidVerifyResponse('network_mismatch') };
    }
    if (requirements.network !== this.network || !isStellarNetwork(requirements.network)) {
      return { response: invalidVerifyResponse('invalid_network') };
    }

    const parsed = this.parsePayload(payload);
    if ('isValid' in parsed) return { response: parsed };
    const wire = parsed;

    if (
      wire.payTo !== payload.accepted.payTo ||
      wire.payTo !== requirements.payTo ||
      wire.asset !== payload.accepted.asset ||
      wire.asset !== requirements.asset
    ) {
      return {
        response: invalidVerifyResponse(
          'payload_invalid',
          wire.from,
          'payload payTo and asset must match accepted and current requirements',
        ),
      };
    }
    if (!isStellarContractAddress(payload.accepted.asset) || !isStellarContractAddress(requirements.asset)) {
      return {
        response: invalidVerifyResponse(
          'payload_invalid',
          wire.from,
          'upto supports SEP-41 Soroban token contract C-addresses only; classic Stellar assets are unsupported',
        ),
      };
    }
    if (wire.maxAmount !== payload.accepted.amount) {
      return {
        response: invalidVerifyResponse(
          'payload_invalid',
          wire.from,
          'payload.maxAmount must equal payload.accepted.amount',
        ),
      };
    }

    const amount = parseIntegerString(requirements.amount);
    if (amount === undefined) {
      return {
        response: invalidVerifyResponse(
          phase === 'settle' ? UPTO_ERROR_CODES.negativeAmount : 'payload_invalid',
          wire.from,
          'requirements.amount must be an integer string',
        ),
      };
    }
    if (phase === 'verify' && amount !== wire.maxAmountValue) {
      return {
        response: invalidVerifyResponse(
          'payload_invalid',
          wire.from,
          'verify requirements.amount must equal payload.maxAmount',
        ),
      };
    }
    if (phase === 'settle' && amount < 0n) {
      return { response: invalidVerifyResponse(UPTO_ERROR_CODES.negativeAmount, wire.from) };
    }
    if (phase === 'settle' && amount > wire.maxAmountValue) {
      return { response: invalidVerifyResponse(UPTO_ERROR_CODES.exceedsAmount, wire.from) };
    }

    const acceptedExtra = payload.accepted.extra;
    const requirementExtra = requirements.extra;
    if (
      !isRecord(acceptedExtra) ||
      !isRecord(requirementExtra) ||
      acceptedExtra.settlementContract !== this.settlementContract ||
      requirementExtra.settlementContract !== this.settlementContract
    ) {
      return {
        response: invalidVerifyResponse(
          'payload_invalid',
          wire.from,
          'accepted and current settlementContract must match the configured canonical contract',
        ),
      };
    }
    if (acceptedExtra.areFeesSponsored !== true || requirementExtra.areFeesSponsored !== true) {
      return {
        response: invalidVerifyResponse(
          'payload_invalid',
          wire.from,
          'upto requires areFeesSponsored to be true in accepted and current requirements',
        ),
      };
    }
    if (
      !Number.isSafeInteger(requirements.maxTimeoutSeconds) ||
      requirements.maxTimeoutSeconds <= 0 ||
      payload.accepted.maxTimeoutSeconds !== requirements.maxTimeoutSeconds
    ) {
      return {
        response: invalidVerifyResponse(
          'payload_invalid',
          wire.from,
          'accepted and current maxTimeoutSeconds must be the same positive integer',
        ),
      };
    }
    if (
      wire.validAfter >= wire.deadline ||
      wire.deadline - wire.validAfter > requirements.maxTimeoutSeconds
    ) {
      return {
        response: invalidVerifyResponse(
          'payload_invalid',
          wire.from,
          'validAfter must precede deadline and the window must not exceed maxTimeoutSeconds',
        ),
      };
    }
    if (this.signingAddresses.has(wire.from)) {
      return {
        response: invalidVerifyResponse(
          'payload_invalid',
          wire.from,
          'the facilitator must not be the upto payer',
        ),
      };
    }

    const server = this.rpcClientFactory(requirements.network, this.rpcConfig);
    const latestLedger = await server.getLatestLedger();
    const now = Number(latestLedger.closeTime);
    if (!Number.isSafeInteger(now)) {
      throw new Error(`Stellar RPC returned invalid latest-ledger closeTime: ${latestLedger.closeTime}`);
    }
    if (now < wire.validAfter) {
      return { response: invalidVerifyResponse(UPTO_ERROR_CODES.notYetValid, wire.from) };
    }
    if (now >= wire.deadline) {
      return { response: invalidVerifyResponse(UPTO_ERROR_CODES.expired, wire.from) };
    }
    if (phase === 'verify' && wire.deadline > now + requirements.maxTimeoutSeconds) {
      return {
        response: invalidVerifyResponse(
          'payload_invalid',
          wire.from,
          'deadline exceeds the verify-time maxTimeoutSeconds horizon',
        ),
      };
    }

    const estimate = await this.estimatedLedgerSeconds(requirements.network);
    const ledgerSeconds = Number.isFinite(estimate) && estimate > 0
      ? estimate
      : DEFAULT_LEDGER_SECONDS;
    const maximumLedger =
      latestLedger.sequence + Math.ceil(requirements.maxTimeoutSeconds / ledgerSeconds);
    const authError = this.validateAuthTree(wire, latestLedger.sequence, maximumLedger);
    if (authError) return { response: authError };

    const signingAddresses = [...this.signingAddresses];
    const selectedAddress =
      phase === 'verify' ? signingAddresses[0] : this.selectSigner(signingAddresses);
    const signer = this.signerMap.get(selectedAddress);
    if (!signer) throw new Error('Stellar facilitator signer selection failed');

    const address = (value: string) => Address.fromString(value).toScVal();
    const operation = Operation.invokeContractFunction({
      contract: this.settlementContract,
      function: 'settle',
      args: [
        address(wire.from),
        address(wire.payTo),
        address(wire.asset),
        nativeToScVal(wire.maxAmountValue, { type: 'i128' }),
        nativeToScVal(BigInt(wire.validAfter), { type: 'u64' }),
        nativeToScVal(BigInt(wire.deadline), { type: 'u64' }),
        nativeToScVal(wire.expirationLedger, { type: 'u32' }),
        nativeToScVal(wire.salt, { type: 'bytes' }),
        nativeToScVal(wire.autoRevoke),
        nativeToScVal(amount, { type: 'i128' }),
      ],
      auth: [wire.authEntry],
    });
    const sourceAccount = await server.getAccount(signer.address);
    const transaction = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: getNetworkPassphrase(requirements.network),
    })
      .addOperation(operation)
      .setTimebounds(now, wire.deadline)
      .build();

    this.assertSponsoredTransaction(transaction, signer.address);

    const simulation = await server.simulateTransaction(
      transaction,
      undefined,
      'enforce',
    );
    if (!rpc.Api.isSimulationSuccess(simulation) || 'restorePreamble' in simulation) {
      const detail = 'error' in simulation ? simulation.error : 'archived ledger entries require restoration';
      const reason = isAuthenticationFailure(detail)
        ? UPTO_ERROR_CODES.accountAuthentication
        : phase === 'verify'
          ? UPTO_ERROR_CODES.allowanceRequired
          : UNEXPECTED_SETTLE_ERROR;
      return { response: invalidVerifyResponse(reason, wire.from, detail) };
    }

    const settlementFee = Number(simulation.minResourceFee) + INCLUSION_BUFFER_STROOPS;
    if (!Number.isSafeInteger(settlementFee) || settlementFee > this.maxTransactionFeeStroops) {
      return {
        response: invalidVerifyResponse(
          UPTO_ERROR_CODES.feeExceedsMaximum,
          wire.from,
          `simulation-derived fee ${settlementFee} stroops exceeds ceiling ${this.maxTransactionFeeStroops} stroops`,
        ),
      };
    }
    const eventError = this.validateEvents(simulation.events, wire, amount);
    if (eventError) return { response: eventError };

    return {
      payer: wire.from,
      amount,
      amountString: requirements.amount,
      network: requirements.network,
      signer,
      server,
      transaction,
      simulation,
    };
  }

  private async pollForTransaction(
    server: RpcClient,
    hash: string,
    maxAttempts: number,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const result = await server.getTransaction(hash);
        if (result.status === 'SUCCESS') return true;
        if (result.status === 'FAILED') return false;
      } catch {
        // Match exact's polling behavior: transient RPC failures consume an
        // attempt but do not turn an otherwise confirmable transaction into an
        // immediate failure.
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollDelayMs));
    }
    return false;
  }

  private assertSponsoredTransaction(transaction: Transaction, signerAddress: string): void {
    if (
      transaction.source !== signerAddress ||
      transaction.operations.length !== 1 ||
      transaction.operations[0].type !== 'invokeHostFunction' ||
      transaction.operations[0].source !== undefined
    ) {
      throw new Error('rebuilt upto transaction violated the one-operation sponsored-source invariant');
    }
  }
}

export function createUptoScheme(signing: StellarSigningContext): UptoStellarScheme {
  if (!Env.uptoSettlementContract) {
    throw new Error('UPTO_SETTLEMENT_CONTRACT is required to enable the upto scheme');
  }
  return new UptoStellarScheme(signing.signers, {
    network: Env.stellarNetwork,
    settlementContract: Env.uptoSettlementContract,
    rpcConfig: { url: Env.stellarRpcUrl },
    maxTransactionFeeStroops: Env.uptoMaxTransactionFeeStroops,
    feeBumpSigner: signing.feeBumpSigner,
    selectSigner: signing.selectSigner,
  });
}
