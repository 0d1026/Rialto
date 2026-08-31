import type { Network, PaymentPayload, PaymentRequirements } from '@x402/core/types';
import {
  Account,
  Address,
  Keypair,
  SorobanDataBuilder,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk';
import { createEd25519Signer } from '@x402/stellar';
import { vi } from 'vitest';

export const NETWORK: Network = 'stellar:testnet';
export const SETTLEMENT_CONTRACT = Address.contract(Buffer.alloc(32, 1)).toString();
export const ASSET = Address.contract(Buffer.alloc(32, 2)).toString();
export const OTHER_CONTRACT = Address.contract(Buffer.alloc(32, 3)).toString();
export const PAYER_KEYPAIR = Keypair.random();
export const PAYEE = Keypair.random().publicKey();
export const FACILITATOR_KEYPAIR = Keypair.random();
export const FACILITATOR_SIGNER = createEd25519Signer(FACILITATOR_KEYPAIR.secret());
export const NOW = 1_800_000_000;
export const CURRENT_LEDGER = 1_000;
export const EXPIRATION_LEDGER = 1_012;

const address = (value: string) => Address.fromString(value).toScVal();
const i128 = (value: bigint) => nativeToScVal(value, { type: 'i128' });
const u64 = (value: number) => nativeToScVal(BigInt(value), { type: 'u64' });
const u32 = (value: number) => nativeToScVal(value, { type: 'u32' });

export function makeInvocation(
  contract: string,
  fnName: string,
  args: xdr.ScVal[],
  subInvocations: xdr.SorobanAuthorizedInvocation[] = [],
): xdr.SorobanAuthorizedInvocation {
  return new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: Address.fromString(contract).toScAddress(),
        functionName: fnName,
        args,
      }),
    ),
    subInvocations,
  });
}

export interface FixtureOptions {
  autoRevoke?: boolean;
  maxAmount?: string;
  validAfter?: number;
  deadline?: number;
  expirationLedger?: number;
  rootArgs?: xdr.ScVal[];
  subInvocations?: xdr.SorobanAuthorizedInvocation[];
  credential?: 'address' | 'sourceAccount';
}

export function createAuthEntry(options: FixtureOptions = {}): xdr.SorobanAuthorizationEntry {
  const autoRevoke = options.autoRevoke ?? true;
  const maxAmount = BigInt(options.maxAmount ?? '1000');
  const validAfter = options.validAfter ?? NOW - 5;
  const deadline = options.deadline ?? NOW + 55;
  const expirationLedger = options.expirationLedger ?? EXPIRATION_LEDGER;
  const salt = Buffer.alloc(32, 9);
  const rootArgs = options.rootArgs ?? [
    address(PAYEE),
    address(ASSET),
    i128(maxAmount),
    u64(validAfter),
    u64(deadline),
    u32(expirationLedger),
    nativeToScVal(salt, { type: 'bytes' }),
    nativeToScVal(autoRevoke),
  ];
  const subInvocations = options.subInvocations ?? [
    makeInvocation(ASSET, 'approve', [
      address(PAYER_KEYPAIR.publicKey()),
      address(SETTLEMENT_CONTRACT),
      i128(maxAmount),
      u32(expirationLedger),
    ]),
    ...(autoRevoke
      ? [
          makeInvocation(ASSET, 'approve', [
            address(PAYER_KEYPAIR.publicKey()),
            address(SETTLEMENT_CONTRACT),
            i128(0n),
            u32(0),
          ]),
        ]
      : []),
  ];
  const credentials = options.credential === 'sourceAccount'
    ? xdr.SorobanCredentials.sorobanCredentialsSourceAccount()
    : xdr.SorobanCredentials.sorobanCredentialsAddress(
        new xdr.SorobanAddressCredentials({
          address: Address.fromString(PAYER_KEYPAIR.publicKey()).toScAddress(),
          nonce: xdr.Int64.fromString('1234'),
          signatureExpirationLedger: expirationLedger,
          signature: xdr.ScVal.scvVoid(),
        }),
      );
  return new xdr.SorobanAuthorizationEntry({
    credentials,
    rootInvocation: makeInvocation(
      SETTLEMENT_CONTRACT,
      'settle',
      rootArgs,
      subInvocations,
    ),
  });
}

export function createPayment(options: FixtureOptions = {}): {
  payload: PaymentPayload;
  requirements: PaymentRequirements;
} {
  const autoRevoke = options.autoRevoke ?? true;
  const maxAmount = options.maxAmount ?? '1000';
  const validAfter = options.validAfter ?? NOW - 5;
  const deadline = options.deadline ?? NOW + 55;
  const expirationLedger = options.expirationLedger ?? EXPIRATION_LEDGER;
  const authEntry = createAuthEntry({ ...options, autoRevoke, maxAmount, validAfter, deadline, expirationLedger });
  const requirements: PaymentRequirements = {
    scheme: 'upto',
    network: NETWORK,
    asset: ASSET,
    amount: maxAmount,
    payTo: PAYEE,
    maxTimeoutSeconds: 60,
    extra: {
      areFeesSponsored: true,
      settlementContract: SETTLEMENT_CONTRACT,
    },
  };
  const payload: PaymentPayload = {
    x402Version: 2,
    accepted: structuredClone(requirements),
    payload: {
      from: PAYER_KEYPAIR.publicKey(),
      payTo: PAYEE,
      asset: ASSET,
      maxAmount,
      validAfter,
      deadline,
      expirationLedger,
      salt: Buffer.alloc(32, 9).toString('hex'),
      autoRevoke,
      authEntries: [authEntry.toXDR('base64')],
    },
  };
  return { payload, requirements };
}

export function transferEvent(amount: bigint): xdr.DiagnosticEvent {
  return new xdr.DiagnosticEvent({
    inSuccessfulContractCall: true,
    event: new xdr.ContractEvent({
      ext: new xdr.ExtensionPoint(0),
      contractId: Address.fromString(ASSET).toScAddress().contractId(),
      type: xdr.ContractEventType.contract(),
      body: new xdr.ContractEventBody(
        0,
        new xdr.ContractEventV0({
          topics: [
            nativeToScVal('transfer', { type: 'symbol' }),
            address(PAYER_KEYPAIR.publicKey()),
            address(PAYEE),
          ],
          data: i128(amount),
        }),
      ),
    }),
  });
}

export function createRpcMock(options: {
  fee?: string;
  simulationError?: string;
  eventAmount?: bigint;
  zeroAmount?: boolean;
} = {}) {
  const events = options.zeroAmount
    ? []
    : [transferEvent(options.eventAmount ?? 1000n)];
  const simulation = options.simulationError
    ? {
        id: 'sim',
        latestLedger: CURRENT_LEDGER,
        events: [],
        _parsed: true,
        error: options.simulationError,
      }
    : {
        id: 'sim',
        latestLedger: CURRENT_LEDGER,
        events,
        _parsed: true,
        minResourceFee: options.fee ?? '500',
        transactionData: new SorobanDataBuilder().setResourceFee(options.fee ?? '500'),
      };

  return {
    getLatestLedger: vi.fn(async () => ({
      sequence: CURRENT_LEDGER,
      closeTime: String(NOW),
    })),
    getAccount: vi.fn(async () => new Account(FACILITATOR_SIGNER.address, '10')),
    simulateTransaction: vi.fn(async (..._args: unknown[]) => simulation),
    sendTransaction: vi.fn(async () => ({ status: 'PENDING', hash: 'abc123' })),
    getTransaction: vi.fn(async () => ({ status: 'SUCCESS' })),
  };
}
