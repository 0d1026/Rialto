import { z } from "zod";

/**
 * Input schema for get_resource. Same split as search-resources.schema.ts:
 * a raw zod shape for McpServer.registerTool's `inputSchema`, plus a
 * z.object() wrapper below for validating the tool's own output.
 */
export const getResourceInputShape = {
  resource: z
    .string()
    .min(1)
    .describe(
      "The resource identifier returned by search_resources (its `resource` field)."
    ),
  toolName: z
    .string()
    .optional()
    .describe(
      "Disambiguates an MCP resource that exposes multiple tools (its `toolName` " +
        "field from search_resources). Omit for HTTP resources."
    ),
};

export const getResourceInputSchema = z.object(getResourceInputShape);
export type GetResourceInput = z.infer<typeof getResourceInputSchema>;

const paymentRequirementsSchema = z.object({
  scheme: z.enum(["exact", "upto"]),
  network: z.string(),
  amount: z.string(),
  asset: z.string(),
  payTo: z.string(),
  maxTimeoutSeconds: z.number().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

export const getResourceOutputSchema = z.object({
  resource: z.string(),
  type: z.string(),
  name: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()),
  toolName: z.string().optional(),
  mimeType: z.string().optional(),
  routeTemplate: z.string().optional(),
  iconUrl: z.string().optional(),
  x402Version: z.number(),
  accepts: z.array(paymentRequirementsSchema),
  lastUpdated: z.string(),
  provenance: z.string(),
  settlementCount: z.number().int().nonnegative(),
  extensions: z.record(z.string(), z.unknown()).optional(),
});
export type GetResourceOutput = z.infer<typeof getResourceOutputSchema>;
