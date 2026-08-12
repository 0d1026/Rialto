import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { DiscoveryClient } from "../clients/discovery-client.js";
import { toMcpToolError } from "../errors/mcp-tool-error.js";
import {
  getResourceInputShape,
  getResourceOutputSchema,
  type GetResourceOutput,
} from "../schemas/get-resource.schema.js";

/**
 * Registers get_resource on the given server.
 *
 * Same shape as search-resources.ts: a thin handler that calls
 * DiscoveryClient and maps errors, with no retrieval logic of its own.
 */
export function registerGetResourceTool(
  server: McpServer,
  config: Config
): void {
  const discoveryClient = new DiscoveryClient(config);

  server.registerTool(
    "get_resource",
    {
      title: "Get Resource",
      description:
        "Fetch full metadata, route template, and payment requirements for a " +
        "resource returned by search_resources.",
      inputSchema: getResourceInputShape,
    },
    async (input) => {
      try {
        const detail = await discoveryClient.getResource({
          resource: input.resource,
          ...(input.toolName !== undefined ? { toolName: input.toolName } : {}),
        });

        const output: GetResourceOutput = getResourceOutputSchema.parse(detail);

        return {
          content: [{ type: "text" as const, text: JSON.stringify(output) }],
        };
      } catch (err) {
        return toMcpToolError(err).toToolResult();
      }
    }
  );
}
