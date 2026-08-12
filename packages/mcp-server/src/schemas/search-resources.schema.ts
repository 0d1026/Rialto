import { z } from "zod";

/**
 * Input schema for search_resources. Kept as a raw zod shape (an object of
 * zod types), not wrapped in z.object() at the point of use, because
 * McpServer.registerTool's `inputSchema` option expects a ZodRawShape -
 * z.object(searchResourcesInputShape) below exists separately for
 * programmatic validation (discovery-client.ts, tests), not for
 * registration.
 */
export const searchResourcesInputShape = {
  query: z
    .string()
    .min(1)
    .describe(
      "Natural-language description of the service being sought, e.g. " +
        '"weather API that takes USDC on stellar".'
    ),
  network: z
    .enum(["stellar:testnet", "stellar:pubnet"])
    .optional()
    .describe("Restrict results to one network. Omit to search both."),
  cursor: z
    .string()
    .optional()
    .describe("Pagination cursor from a previous search_resources call."),
  limit: z.number().int().min(1).max(50).default(10),
};

export const searchResourcesInputSchema = z.object(searchResourcesInputShape);
export type SearchResourcesInput = z.infer<typeof searchResourcesInputSchema>;

/**
 * Output shape. MCP tool outputs are free-form JSON text content, not a
 * registered schema the SDK enforces - this exists so the tool handler and
 * tests validate against one definition instead of duplicating the shape.
 */
export const searchResourcesOutputSchema = z.object({
  results: z.array(
    z.object({
      resource: z.string(),
      type: z.string(),
      name: z.string(),
      description: z.string().optional(),
      tags: z.array(z.string()),
      network: z.string().nullable(),
      settlementCount: z.number().int().nonnegative(),
    })
  ),
  cursor: z.string().nullable(),
  partialResults: z.boolean(),
});
export type SearchResourcesOutput = z.infer<typeof searchResourcesOutputSchema>;