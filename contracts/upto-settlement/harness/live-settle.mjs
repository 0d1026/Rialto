/**
 * Live testnet harness for the deployed UptoSettlement contract.
 *
 * Drives four cases through the contract on stellar:testnet:
 *   partial  actual < max_amount     - transfers actual, remainder never leaves the payer
 *   max      actual == max_amount    - transfers the full ceiling
 *   overcap  actual > max_amount     - MUST be rejected by the contract guard
 *   expired  deadline in the past    - MUST be rejected by the contract guard
 *
 * The payer signs only the Soroban authorization entry over the argument tuple
 * (from, pay_to, asset, max_amount, valid_after, deadline, expiration_ledger,
 * salt, auto_revoke). The facilitator is the transaction source and fee payer,
 * so the payer spends no XLM. Replay is impossible by construction: each
 * authorization commits to a unique salt and the protocol nonce is consumed on
 * settle.
 *
 * Config is read from the environment; no secrets are committed.
 *   RPC_URL              soroban RPC (default testnet public)
 *   UPTO_CONTRACT        deployed contract id
 *   USDC_CONTRACT        SEP-41 token id (default canonical testnet USDC)
 *   PAYER_SECRET         S... payer, signs the authorization
 *   PAYEE_PUBLIC         G... recipient
 *   FACILITATOR_SECRET   S... transaction source and fee payer
 *
 * Emits a JSON result object on stdout for the evidence report to consume.
 */
import {
  Keypair, Contract, TransactionBuilder, Networks, Operation, Address,
  nativeToScVal, xdr, rpc, authorizeEntry, BASE_FEE,
} from '@stellar/stellar-sdk';

const RPC_URL = process.env.RPC_URL || 'https://soroban-testnet.stellar.org';
const CONTRACT = requireEnv('UPTO_CONTRACT');
const USDC = process.env.USDC_CONTRACT || 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
const PASSPHRASE = Networks.TESTNET;

const payer = Keypair.fromSecret(requireEnv('PAYER_SECRET'));
const facilitator = Keypair.fromSecret(requireEnv('FACILITATOR_SECRET'));
const payTo = requireEnv('PAYEE_PUBLIC');
const server = new rpc.Server(RPC_URL);

const i128 = (n) => nativeToScVal(BigInt(n), { type: 'i128' });
const u64 = (n) => nativeToScVal(BigInt(n), { type: 'u64' });
const u32 = (n) => nativeToScVal(n, { type: 'u32' });
const addr = (a) => new Address(a).toScVal();

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
}

async function settle({ max, actual, validAfter, deadline, salt, autoRevoke, label }) {
  const { sequence } = await server.getLatestLedger();
  const expirationLedger = sequence + 200;

  const args = [
    addr(payer.publicKey()), addr(payTo), addr(USDC),
    i128(max), u64(validAfter), u64(deadline), u32(expirationLedger),
    nativeToScVal(salt, { type: 'bytes' }),
    nativeToScVal(autoRevoke, { type: 'bool' }),
    i128(actual),
  ];

  const contract = new Contract(CONTRACT);
  const source = await server.getAccount(facilitator.publicKey());
  const fee = (Number(BASE_FEE) * 1000).toString();

  const probe = new TransactionBuilder(source, { fee, networkPassphrase: PASSPHRASE })
    .addOperation(contract.call('settle', ...args))
    .setTimeout(120)
    .build();
  const sim = await server.simulateTransaction(probe);
  if (rpc.Api.isSimulationError(sim)) {
    return { label, ok: false, phase: 'simulate', reason: sim.error };
  }

  const signedAuth = [];
  for (const entry of sim.result?.auth ?? []) {
    if (entry.credentials().switch().name === 'sorobanCredentialsAddress') {
      signedAuth.push(await authorizeEntry(entry, payer, sequence + 200, PASSPHRASE));
    } else {
      signedAuth.push(entry);
    }
  }

  const authedOp = Operation.invokeContractFunction({
    contract: CONTRACT, function: 'settle', args, auth: signedAuth,
  });
  const rebuilt = new TransactionBuilder(await server.getAccount(facilitator.publicKey()), {
    fee, networkPassphrase: PASSPHRASE,
  })
    .addOperation(authedOp)
    .setTimeout(120)
    .build();
  const prepared = rpc.assembleTransaction(rebuilt, sim).build();
  prepared.sign(facilitator);

  const sent = await server.sendTransaction(prepared);
  if (sent.status === 'ERROR') {
    return { label, ok: false, phase: 'send', reason: sent.errorResult?.result?.().switch?.().name ?? sent.status };
  }
  let got = await server.getTransaction(sent.hash);
  for (let i = 0; i < 25 && got.status === 'NOT_FOUND'; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    got = await server.getTransaction(sent.hash);
  }
  return { label, ok: got.status === 'SUCCESS', status: got.status, hash: sent.hash };
}

const now = Math.floor(Date.now() / 1000);
const mkSalt = (n) => { const b = new Uint8Array(32); b[0] = n; b[31] = now & 0xff; return Buffer.from(b); };

const results = {};
results.partial = await settle({ max: 1_000_000, actual: 300_000, validAfter: 0, deadline: now + 300, salt: mkSalt(1), autoRevoke: true, label: 'partial' });
results.max = await settle({ max: 500_000, actual: 500_000, validAfter: 0, deadline: now + 300, salt: mkSalt(2), autoRevoke: true, label: 'max' });
results.overcap = await settle({ max: 1_000_000, actual: 2_000_000, validAfter: 0, deadline: now + 300, salt: mkSalt(3), autoRevoke: true, label: 'overcap' });
results.expired = await settle({ max: 500_000, actual: 100_000, validAfter: 0, deadline: now - 60, salt: mkSalt(4), autoRevoke: true, label: 'expired' });

const report = {
  network: 'stellar:testnet',
  contract: CONTRACT,
  token: USDC,
  payer: payer.publicKey(),
  payee: payTo,
  feePayer: facilitator.publicKey(),
  cases: results,
};
console.log(JSON.stringify(report, null, 2));

const guardsHeld = results.partial.ok && results.max.ok && !results.overcap.ok && !results.expired.ok;
process.exit(guardsHeld ? 0 : 1);
