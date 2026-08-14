/**
 * Live Rialto endpoints and demo parameters for the interactive /try page.
 * Values are read from the environment with the current live deployment as the
 * default, so the page works out of the box and is overridable per environment.
 */
export const RIALTO = {
  discoveryUrl: (
    process.env.DISCOVERY_URL || 'https://rialto-production-97c9.up.railway.app'
  ).replace(/\/$/, ''),
  facilitatorUrl: (
    process.env.FACILITATOR_URL || 'https://facilitator-production-0beb.up.railway.app'
  ).replace(/\/$/, ''),
  rpcUrl: process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org',
  network: process.env.STELLAR_NETWORK || 'stellar:testnet',
  usdc:
    process.env.USDC_CONTRACT ||
    'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
  /** Recipient of the demo payment; must hold a USDC trustline on testnet. */
  demoPayee:
    process.env.DEMO_PAYEE_PUBLIC ||
    'GDX57LT35SHXNCOF27JHG7HFUMVG7W7YSZMREQAY6UEBE23VU3UB6V2E',
  demoResource: 'https://demo-seller.rialto.dev/insights',
  /** 0.01 USDC in atomic units (6 decimals). */
  demoAmount: '10000',
} as const;

export function explorerTx(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}
