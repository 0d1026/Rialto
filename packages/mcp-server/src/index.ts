import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";


async function main(): Promise<void> {
  const config = loadConfig();

  if (config.MCP_TRANSPORT !== "stdio") {
    throw new Error(
      `MCP_TRANSPORT=${config.MCP_TRANSPORT} is not implemented yet ` 
    );
  }

  const server = createServer(config);
  const transport = new StdioServerTransport();

  await server.connect(transport);


  console.error("[rialto-mcp-server] connected over stdio");

  const shutdown = async (signal: string): Promise<void> => {
    console.error(`[rialto-mcp-server] received ${signal}, shutting down`);
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[rialto-mcp-server] fatal error during startup:", err);
  process.exit(1);
});