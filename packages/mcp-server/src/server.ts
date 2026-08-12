import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Config } from "./config.js";
import { registerSearchResourcesTool } from "./tools/search-resources.js";

export function createServer(config: Config): McpServer {
  const server = new McpServer({
    name: "rialto-mcp-server",
    version: "0.1.0",
  });

  registerSearchResourcesTool(server, config);

  return server;
}