/** Environment configuration - every knob explicit, nothing hardwired. */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

type Network = `${string}:${string}`;

function requiredNetwork(): Network {
  const v = process.env.STELLAR_NETWORK ?? 'stellar:testnet';
  if (!/^[a-z0-9-]+:[a-z0-9-]+$/i.test(v)) {
    throw new Error(`STELLAR_NETWORK must be a CAIP-2 id like stellar:testnet, got: ${v}`);
  }
  return v as Network;
}

export const Env = {
  port: Number(process.env.PORT ?? 4022),
  stellarNetwork: requiredNetwork(),
  stellarRpcUrl: process.env.STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  stellarPrivateKey: required('FACILITATOR_STELLAR_PRIVATE_KEY'),
  /** Channel-accounts mode (SDF pattern): set both to enable. */
  feeBumpSecret: process.env.FACILITATOR_STELLAR_FEE_BUMP_SECRET,
  channelSecrets: process.env.FACILITATOR_STELLAR_CHANNEL_SECRETS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  /**
   * Library default is 50,000 stroops - below real Soroban resource fees in
   * practice (SDF's own reference config warns about this; we ran 200k in
   * testing), so the bound is explicit configuration.
   */
  maxTransactionFeeStroops: Number(process.env.MAX_TRANSACTION_FEE_STROOPS ?? 200_000),
  /** Optional activation switch and canonical network deployment for `upto`. */
  uptoSettlementContract: process.env.UPTO_SETTLEMENT_CONTRACT?.trim() || undefined,
  /** Independent `upto` safety ceiling from the frozen scheme specification. */
  uptoMaxTransactionFeeStroops: Number(
    process.env.UPTO_MAX_TRANSACTION_FEE_STROOPS ?? 50_000,
  ),
  /** Where SettlementEvents are POSTed (Xpan's ingestion). Empty = disabled. */
  discoveryIngestUrl: process.env.DISCOVERY_INGEST_URL ?? '',
  /** Bearer token discovery's ingest endpoint checks; must match its INGEST_TOKEN. */
  discoveryIngestToken: process.env.INGEST_TOKEN ?? '',
  /** Optional bearer token; unset = open (local/private use only). */
  apiKey: process.env.FACILITATOR_API_KEY,
  corsOrigins: process.env.CORS_ORIGINS ?? '*',
  trustProxy: (process.env.TRUST_PROXY ?? 'loopback,linklocal,uniquelocal')
    .split(',')
    .map((s) => s.trim()),
};
