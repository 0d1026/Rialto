import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { Config } from "./config";


export function createServer(config: Config): McpServer {
  const server = new McpServer({
    name: "rialto-mcp-server",
    version: "0.1.0",
  });

 

  return server;
}