import { z } from "zod";


const configSchema = z.object({
  DISCOVERY_URL: z.string().url(),

  FACILITATOR_URL: z.string().url(),

  NETWORK: z.enum(["stellar:testnet", "stellar:pubnet"]).default("stellar:testnet"),

  RIALTO_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(2_000),

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