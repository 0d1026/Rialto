/**
 * Live `upto` facilitator flow: build and sign one Soroban authorization
 * entry, verify the maximum, then settle an independently metered amount.
 *
 * Required environment:
 *   FACILITATOR_URL          deployed Rialto facilitator
 *   UPTO_CONTRACT            canonical UptoSettlement deployment
 *   PAYER_SECRET             payer auth-entry signer
 *   SIMULATION_SOURCE_SECRET funded G-account distinct from the payer
 *   PAYEE_PUBLIC             settlement recipient
 *
 * Optional: RPC_URL, NETWORK, TOKEN_CONTRACT, MAX_AMOUNT, ACTUAL_AMOUNT,
 * MAX_TIMEOUT_SECONDS, AUTO_REVOKE, FACILITATOR_API_KEY.
 */
import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  authorizeEntry,
  nativeToScVal,
  rpc,
} from '@stellar/stellar-sdk';
import { getEstimatedLedgerCloseTimeSeconds } from '@x402/stellar';

const FACILITATOR_URL = requireEnv('FACILITATOR_URL').replace(/\/$/, '');
const UPTO_CONTRACT = requireEnv('UPTO_CONTRACT');
const PAYER_SECRET = requireEnv('PAYER_SECRET');
const SIMULATION_SOURCE_SECRET = requireEnv('SIMULATION_SOURCE_SECRET');
const PAYEE = requireEnv('PAYEE_PUBLIC');
const RPC_URL = process.env.RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK = process.env.NETWORK || 'stellar:testnet';
const TOKEN = process.env.TOKEN_CONTRACT || 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
const MAX_AMOUNT = process.env.MAX_AMOUNT || '100000';
const ACTUAL_AMOUNT = process.env.ACTUAL_AMOUNT || '40000';
const MAX_TIMEOUT_SECONDS = Number(process.env.MAX_TIMEOUT_SECONDS || 120);
const AUTO_REVOKE = (process.env.AUTO_REVOKE || 'true').toLowerCase() !== 'false';
const API_KEY = process.env.FACILITATOR_API_KEY;
const PASSPHRASE = NETWORK === 'stellar:pubnet' ? Networks.PUBLIC : Networks.TESTNET;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var: ${name}`);
  return value;
}

async function post(path, body) {
  const response = await fetch(`${FACILITATOR_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(API_KEY ? { authorization: `Bearer ${API_KEY}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const result = await response.json();
  return { status: response.status, result };
}

const address = (value) => Address.fromString(value).toScVal();
const i128 = (value) => nativeToScVal(BigInt(value), { type: 'i128' });
const u64 = (value) => nativeToScVal(BigInt(value), { type: 'u64' });
const u32 = (value) => nativeToScVal(value, { type: 'u32' });

async function main() {
  const payer = Keypair.fromSecret(PAYER_SECRET);
  const simulationSource = Keypair.fromSecret(SIMULATION_SOURCE_SECRET);
  if (payer.publicKey() === simulationSource.publicKey()) {
    throw new Error('SIMULATION_SOURCE_SECRET must be different from the payer');
  }
  if (BigInt(ACTUAL_AMOUNT) < 0n || BigInt(ACTUAL_AMOUNT) > BigInt(MAX_AMOUNT)) {
    throw new Error('ACTUAL_AMOUNT must be between zero and MAX_AMOUNT');
  }

  const server = new rpc.Server(RPC_URL);
  const latest = await server.getLatestLedger();
  const now = Number(latest.closeTime);
  const validAfter = now - 5;
  const deadline = now + MAX_TIMEOUT_SECONDS - 5;
  const estimatedLedgerSeconds = await getEstimatedLedgerCloseTimeSeconds(NETWORK);
  const ledgerSeconds = Number.isFinite(estimatedLedgerSeconds) && estimatedLedgerSeconds > 0
    ? estimatedLedgerSeconds
    : 5;
  const expirationLedger = latest.sequence + Math.ceil(MAX_TIMEOUT_SECONDS / ledgerSeconds);
  const salt = Keypair.random().rawSecretKey();

  const callArgs = [
    address(payer.publicKey()),
    address(PAYEE),
    address(TOKEN),
    i128(MAX_AMOUNT),
    u64(validAfter),
    u64(deadline),
    u32(expirationLedger),
    nativeToScVal(salt, { type: 'bytes' }),
    nativeToScVal(AUTO_REVOKE),
    i128(0),
  ];
  const source = await server.getAccount(simulationSource.publicKey());
  const candidate = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(new Contract(UPTO_CONTRACT).call('settle', ...callArgs))
    .setTimebounds(now, deadline)
    .build();
  const recording = await server.simulateTransaction(candidate);
  if (!rpc.Api.isSimulationSuccess(recording) || !recording.result?.auth) {
    throw new Error(`recording simulation failed: ${'error' in recording ? recording.error : 'missing auth'}`);
  }

  const payerEntries = recording.result.auth.filter((entry) => {
    const credentials = entry.credentials();
    return credentials.switch().name === 'sorobanCredentialsAddress' &&
      Address.fromScAddress(credentials.address().address()).toString() === payer.publicKey();
  });
  if (payerEntries.length !== 1) {
    throw new Error(`expected one payer authorization entry, received ${payerEntries.length}`);
  }
  const signedEntry = await authorizeEntry(
    payerEntries[0],
    payer,
    expirationLedger,
    PASSPHRASE,
  );

  const accepted = {
    scheme: 'upto',
    network: NETWORK,
    asset: TOKEN,
    amount: MAX_AMOUNT,
    payTo: PAYEE,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    extra: { areFeesSponsored: true, settlementContract: UPTO_CONTRACT },
  };
  const paymentPayload = {
    x402Version: 2,
    accepted,
    payload: {
      from: payer.publicKey(),
      payTo: PAYEE,
      asset: TOKEN,
      maxAmount: MAX_AMOUNT,
      validAfter,
      deadline,
      expirationLedger,
      salt: Buffer.from(salt).toString('hex'),
      autoRevoke: AUTO_REVOKE,
      authEntries: [signedEntry.toXDR('base64')],
    },
  };

  const verified = await post('/verify', {
    paymentPayload,
    paymentRequirements: accepted,
  });
  if (verified.status !== 200 || !verified.result.isValid) {
    throw new Error(`verify failed (${verified.status}): ${JSON.stringify(verified.result)}`);
  }

  const settlementRequirements = { ...accepted, amount: ACTUAL_AMOUNT };
  const settled = await post('/settle', {
    paymentPayload,
    paymentRequirements: settlementRequirements,
  });
  if (settled.status !== 200 || !settled.result.success) {
    throw new Error(`settle failed (${settled.status}): ${JSON.stringify(settled.result)}`);
  }
  if (settled.result.amount !== ACTUAL_AMOUNT) {
    throw new Error(`settlement echoed ${settled.result.amount}, expected ${ACTUAL_AMOUNT}`);
  }

  console.log(JSON.stringify({
    success: true,
    network: NETWORK,
    payer: payer.publicKey(),
    maxAmount: MAX_AMOUNT,
    amount: ACTUAL_AMOUNT,
    autoRevoke: AUTO_REVOKE,
    transaction: settled.result.transaction,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
