import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Config } from "./config.js";
import { registerSearchResourcesTool } from "./tools/search-resources.js";
import { registerGetResourceTool } from "./tools/get-resource.js";
import { registerPaidCallTool } from "./tools/paid-call.js";
import { createKeypairSigner } from "./payment/signers/keypair-signer.js";

export function createServer(config: Config): McpServer {
  const server = new McpServer({
    name: "rialto-mcp-server",
    version: "0.1.0",
  });

  // Built once, at boot, from config - never per tool-call, never from a
  // tool argument. undefined when no key is configured; paid_call itself
  // decides how to fail in that case (see tools/paid-call.ts).
  const signer = createKeypairSigner(config);

  registerSearchResourcesTool(server, config);
  registerGetResourceTool(server, config);
  registerPaidCallTool(server, config, signer);

  return server;
}