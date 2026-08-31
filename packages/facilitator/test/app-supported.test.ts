import type { SettleResponse, VerifyResponse } from '@x402/core/types';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { Env } from '../src/config/env.js';
import { buildFacilitator } from '../src/schemes/registry.js';
import { NETWORK, SETTLEMENT_CONTRACT } from './helpers/upto-fixtures.js';

function facilitator(kinds: Array<Record<string, unknown>>) {
  return {
    verify: vi.fn(async (): Promise<VerifyResponse> => ({
      isValid: false,
      invalidReason: 'UPTO_ALLOWANCE_REQUIRED',
    })),
    settle: vi.fn(async (): Promise<SettleResponse> => ({
      success: false,
      transaction: '',
      network: NETWORK,
    })),
    getSupported: vi.fn(() => ({ kinds, extensions: [], signers: {} })),
  };
}

describe('facilitator routes', () => {
  const originalContract = Env.uptoSettlementContract;

  afterEach(() => {
    Env.uptoSettlementContract = originalContract;
  });

  it('advertises configured upto with its canonical settlement contract', async () => {
    Env.uptoSettlementContract = SETTLEMENT_CONTRACT;
    const kind = {
      x402Version: 2,
      scheme: 'upto',
      network: NETWORK,
      extra: { areFeesSponsored: true, settlementContract: SETTLEMENT_CONTRACT },
    };
    expect(buildFacilitator().getSupported().kinds).toContainEqual(kind);
  });

  it('preserves exact-only supported output when upto is not configured', async () => {
    Env.uptoSettlementContract = undefined;
    const supported = buildFacilitator().getSupported();
    expect(supported.kinds.some((kind) => kind.scheme === 'upto')).toBe(false);
    expect(supported.kinds.some((kind) => kind.scheme === 'exact')).toBe(true);
  });

  it('maps UPTO_ALLOWANCE_REQUIRED verification to HTTP 412', async () => {
    const response = await request(createApp(facilitator([]) as never))
      .post('/verify')
      .send({
        paymentPayload: { x402Version: 2, accepted: {}, payload: {} },
        paymentRequirements: {
          scheme: 'upto',
          network: NETWORK,
          payTo: 'payer',
          amount: '1',
        },
      });
    expect(response.status).toBe(412);
    expect(response.body.invalidReason).toBe('UPTO_ALLOWANCE_REQUIRED');
  });
});
