import { z } from "zod";


const configSchema = z.object({
  DISCOVERY_URL: z.string().url(),

  FACILITATOR_URL: z.string().url(),

  // Sent as `Authorization: Bearer <key>` to /verify, /settle, /supported.
  // Optional because a self-hosted facilitator with no key configured
  // accepts unauthenticated requests (packages/facilitator's requireApiKey
  // is a no-op when its own expectedApiKey is unset).
  FACILITATOR_API_KEY: z.string().optional(),

  // The buyer/agent's own Stellar signing key - required only by tools that
  // actually pay (paid_call), not by search_resources/get_resource, so this
  // stays optional at the config layer and is checked at the point a scheme
  // needs to sign (schemes/exact.ts).
  BUYER_STELLAR_PRIVATE_KEY: z.string().optional(),

  NETWORK: z.enum(["stellar:testnet", "stellar:pubnet"]).default("stellar:testnet"),

  // discovery-client.ts's budget - fast, Postgres-backed calls.
  RIALTO_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(2_000),

  // facilitator-client.ts's budget - a real /settle call can legitimately
  // poll for on-chain confirmation for several seconds (@x402/stellar's
  // facilitator scheme polls up to 15 times at 1s intervals), so this needs
  // real headroom, not RIALTO_SERVICE_TIMEOUT_MS's fast-Postgres-call
  // budget - discovered by the default timing out against a real testnet
  // settlement.
  FACILITATOR_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),

  SELLER_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  MCP_TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
});

export type Config = z.infer<typeof configSchema>;

let cached: Config | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (cached) return cached;

  const result = configSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid @rialto/mcp-server configuration:\n${issues}`);
  }

  cached = result.data;
  return cached;
}

export function _resetConfigForTests(): void {
  cached = undefined;
}