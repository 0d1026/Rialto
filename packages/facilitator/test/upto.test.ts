import { Address, nativeToScVal, type Transaction } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { UptoStellarScheme, UPTO_ERROR_CODES } from '../src/schemes/upto.js';
import {
  ASSET,
  EXPIRATION_LEDGER,
  FACILITATOR_SIGNER,
  NETWORK,
  NOW,
  OTHER_CONTRACT,
  PAYER_KEYPAIR,
  PAYEE,
  SETTLEMENT_CONTRACT,
  createAuthEntry,
  createPayment,
  createRpcMock,
  makeInvocation,
} from './helpers/upto-fixtures.js';

function createScheme(rpcMock: ReturnType<typeof createRpcMock>, ceiling = 50_000) {
  return new UptoStellarScheme([FACILITATOR_SIGNER], {
    network: NETWORK,
    settlementContract: SETTLEMENT_CONTRACT,
    maxTransactionFeeStroops: ceiling,
    rpcClientFactory: () => rpcMock as never,
    estimatedLedgerSeconds: async () => 5,
    pollDelayMs: 0,
  });
}

describe('UptoStellarScheme', () => {
  for (const autoRevoke of [true, false]) {
    it(`verifies and settles a valid payment with autoRevoke=${autoRevoke}`, async () => {
      const rpcMock = createRpcMock();
      const scheme = createScheme(rpcMock);
      const { payload, requirements } = createPayment({ autoRevoke });

      await expect(scheme.verify(payload, requirements)).resolves.toEqual({
        isValid: true,
        payer: PAYER_KEYPAIR.publicKey(),
      });
      requirements.amount = '400';
      // Replace the settle simulation with the phase-appropriate transfer.
      const settleRpc = createRpcMock({ eventAmount: 400n });
      const settleScheme = createScheme(settleRpc);
      await expect(settleScheme.settle(payload, requirements)).resolves.toMatchObject({
        success: true,
        transaction: 'abc123',
        network: NETWORK,
        payer: PAYER_KEYPAIR.publicKey(),
        amount: '400',
      });
      expect(settleRpc.simulateTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ source: FACILITATOR_SIGNER.address }),
        undefined,
        'enforce',
      );
      const simulatedTransaction = settleRpc.simulateTransaction.mock.calls[0][0] as Transaction;
      const auth = simulatedTransaction.operations[0].type === 'invokeHostFunction'
        ? simulatedTransaction.operations[0].auth
        : [];
      expect(auth?.[0].toXDR('base64')).toBe(
        (payload.payload.authEntries as string[])[0],
      );
    });
  }

  it('rejects a settlement amount over maxAmount before simulation', async () => {
    const rpcMock = createRpcMock();
    const scheme = createScheme(rpcMock);
    const { payload, requirements } = createPayment();
    requirements.amount = '1001';

    const result = await scheme.settle(payload, requirements);
    expect(result).toMatchObject({
      success: false,
      errorReason: UPTO_ERROR_CODES.exceedsAmount,
    });
    expect(rpcMock.simulateTransaction).not.toHaveBeenCalled();
  });

  it('rejects negative settlement amounts', async () => {
    const rpcMock = createRpcMock();
    const { payload, requirements } = createPayment();
    requirements.amount = '-1';
    await expect(createScheme(rpcMock).settle(payload, requirements)).resolves.toMatchObject({
      success: false,
      errorReason: UPTO_ERROR_CODES.negativeAmount,
    });
  });

  it.each(['0', '-1', 'not-an-integer', (1n << 127n).toString()])(
    'rejects invalid maxAmount %s',
    async (maxAmount) => {
      const rpcMock = createRpcMock();
      const { payload, requirements } = createPayment();
      payload.payload.maxAmount = maxAmount;
      payload.accepted.amount = maxAmount;
      requirements.amount = maxAmount;
      await expect(createScheme(rpcMock).verify(payload, requirements)).resolves.toMatchObject({
        isValid: false,
        invalidReason: UPTO_ERROR_CODES.invalidMaxAmount,
      });
      expect(rpcMock.getLatestLedger).not.toHaveBeenCalled();
    },
  );

  it.each([
    { label: 'not yet valid', validAfter: NOW + 1, deadline: NOW + 50, code: UPTO_ERROR_CODES.notYetValid },
    { label: 'expired', validAfter: NOW - 60, deadline: NOW, code: UPTO_ERROR_CODES.expired },
  ])('rejects a $label window', async ({ validAfter, deadline, code }) => {
    const rpcMock = createRpcMock();
    const { payload, requirements } = createPayment({ validAfter, deadline });
    const scheme = createScheme(rpcMock);
    await expect(scheme.verify(payload, requirements)).resolves.toMatchObject({
      isValid: false,
      invalidReason: code,
    });
    await expect(scheme.settle(payload, requirements)).resolves.toMatchObject({
      success: false,
      errorReason: code,
    });
  });

  it('rejects missing and extra auth sub-invocations', async () => {
    const address = (value: string) => Address.fromString(value).toScVal();
    const positive = makeInvocation(ASSET, 'approve', [
      address(PAYER_KEYPAIR.publicKey()),
      address(SETTLEMENT_CONTRACT),
      nativeToScVal(1000n, { type: 'i128' }),
      nativeToScVal(EXPIRATION_LEDGER, { type: 'u32' }),
    ]);
    for (const subInvocations of [[], [positive, positive, positive]]) {
      const rpcMock = createRpcMock();
      const { payload, requirements } = createPayment({ subInvocations });
      const result = await createScheme(rpcMock).verify(payload, requirements);
      expect(result).toMatchObject({ isValid: false, invalidReason: 'payload_invalid' });
      expect(rpcMock.simulateTransaction).not.toHaveBeenCalled();
    }
  });

  it('rejects source-account implicit authorization', async () => {
    const rpcMock = createRpcMock();
    const { payload, requirements } = createPayment({ credential: 'sourceAccount' });
    await expect(createScheme(rpcMock).verify(payload, requirements)).resolves.toMatchObject({
      isValid: false,
      invalidReason: 'payload_invalid',
    });
  });

  it('rejects amount in the signed root tuple', async () => {
    const base = createAuthEntry().rootInvocation().function().contractFn().args();
    const { payload, requirements } = createPayment({
      rootArgs: [...base, nativeToScVal(1000n, { type: 'i128' })],
    });
    await expect(createScheme(createRpcMock()).verify(payload, requirements)).resolves.toMatchObject({
      isValid: false,
      invalidReason: 'payload_invalid',
    });
  });

  it('rejects a settlement contract mismatch', async () => {
    const rpcMock = createRpcMock();
    const { payload, requirements } = createPayment();
    requirements.extra.settlementContract = OTHER_CONTRACT;
    await expect(createScheme(rpcMock).verify(payload, requirements)).resolves.toMatchObject({
      isValid: false,
      invalidReason: 'payload_invalid',
    });
    expect(rpcMock.getLatestLedger).not.toHaveBeenCalled();
  });

  it('independently bounds expirationLedger against the current ledger horizon', async () => {
    const rpcMock = createRpcMock();
    const { payload, requirements } = createPayment({ expirationLedger: 1013 });
    await expect(createScheme(rpcMock).verify(payload, requirements)).resolves.toMatchObject({
      isValid: false,
      invalidReason: 'payload_invalid',
      invalidMessage: expect.stringContaining('expirationLedger must be between'),
    });
    expect(rpcMock.simulateTransaction).not.toHaveBeenCalled();
  });

  it('rejects classic assets before RPC simulation with a clear message', async () => {
    const rpcMock = createRpcMock();
    const { payload, requirements } = createPayment();
    payload.payload.asset = 'native';
    payload.accepted.asset = 'native';
    requirements.asset = 'native';
    const result = await createScheme(rpcMock).verify(payload, requirements);
    expect(result).toMatchObject({
      isValid: false,
      invalidReason: 'payload_invalid',
      invalidMessage: expect.stringContaining('classic Stellar assets are unsupported'),
    });
    expect(rpcMock.getLatestLedger).not.toHaveBeenCalled();
  });

  it('classifies a non-SEP-41 C-address simulation failure as allowance required', async () => {
    const rpcMock = createRpcMock({ simulationError: 'contract missing approve function' });
    const { payload, requirements } = createPayment();
    await expect(createScheme(rpcMock).verify(payload, requirements)).resolves.toMatchObject({
      isValid: false,
      invalidReason: UPTO_ERROR_CODES.allowanceRequired,
    });
  });

  it('classifies enforcing authorization failures precisely', async () => {
    const rpcMock = createRpcMock({ simulationError: 'host authentication signature rejected' });
    const { payload, requirements } = createPayment();
    await expect(createScheme(rpcMock).verify(payload, requirements)).resolves.toMatchObject({
      isValid: false,
      invalidReason: UPTO_ERROR_CODES.accountAuthentication,
    });
  });

  it('enforces the fee ceiling at verify and settle', async () => {
    const { payload, requirements } = createPayment();
    const verifyResult = await createScheme(createRpcMock({ fee: '1000' }), 1000).verify(
      payload,
      requirements,
    );
    expect(verifyResult).toMatchObject({
      isValid: false,
      invalidReason: UPTO_ERROR_CODES.feeExceedsMaximum,
    });

    requirements.amount = '400';
    const settleResult = await createScheme(
      createRpcMock({ fee: '1000', eventAmount: 400n }),
      1000,
    ).settle(payload, requirements);
    expect(settleResult).toMatchObject({
      success: false,
      errorReason: UPTO_ERROR_CODES.feeExceedsMaximum,
    });
  });

  it('uses the established exact-scheme fallback for non-auth settle simulation errors', async () => {
    const { payload, requirements } = createPayment();
    requirements.amount = '400';
    const result = await createScheme(
      createRpcMock({ simulationError: 'contract execution failed' }),
    ).settle(payload, requirements);
    expect(result).toMatchObject({ success: false, errorReason: 'unexpected_settle_error' });
  });

  it('accepts zero settlement only when simulation emits no transfer', async () => {
    const { payload, requirements } = createPayment();
    requirements.amount = '0';
    await expect(
      createScheme(createRpcMock({ zeroAmount: true })).settle(payload, requirements),
    ).resolves.toMatchObject({ success: true, amount: '0' });
  });
});
