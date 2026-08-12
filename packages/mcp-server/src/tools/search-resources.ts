import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { DiscoveryClient } from "../clients/discovery-client.js";
import { toMcpToolError } from "../errors/mcp-tool-error.js";
import {
  searchResourcesInputShape,
  searchResourcesOutputSchema,
  type SearchResourcesOutput,
} from "../schemas/search-resources.schema.js";

/**
 * Registers search_resources on the given server.
 *
 * Handler is deliberately thin: the SDK parses/validates input against
 * searchResourcesInputShape before this runs, so the body here is just
 * "call DiscoveryClient, shape the response, catch and normalize errors."
 * No retrieval logic lives here - that's discovery-client.ts and, upstream
 * of it, @rialto/discovery itself (ADR 0002).
 */
export function registerSearchResourcesTool(
  server: McpServer,
  config: Config
): void {
  const discoveryClient = new DiscoveryClient(config);

  server.registerTool(
    "search_resources",
    {
      title: "Search Resources",
      description:
        "Search the Bazaar catalog for paid services matching a " +
        "natural-language description, with an optional network filter.",
      inputSchema: searchResourcesInputShape,
    },
    async (input) => {
      try {
        const response = await discoveryClient.search({
          query: input.query,
          limit: input.limit,
          ...(input.network !== undefined ? { network: input.network } : {}),
          ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
        });

        const output: SearchResourcesOutput = searchResourcesOutputSchema.parse({
          results: response.results,
          cursor: response.cursor,
          partialResults: response.partialResults,
        });

        return {
          content: [{ type: "text" as const, text: JSON.stringify(output) }],
        };
      } catch (err) {
        return toMcpToolError(err).toToolResult();
      }
    }
  );
}