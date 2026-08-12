import { z } from "zod";

/**
 * Input schema for paid_call. `resource`/`toolName` match get_resource's
 * fields on purpose - an agent typically has just called get_resource and
 * is handing the same identifier back. Everything else (method/headers/body)
 * is the actual HTTP shape needed to call the resource; this repo has no
 * formal declared-input-contract type to derive it from automatically.
 */
export const paidCallInputShape = {
  resource: z
    .string()
    .min(1)
    .describe("The resource identifier from search_resources/get_resource (its `resource` field)."),
  toolName: z
    .string()
    .optional()
    .describe("Disambiguates an MCP resource that exposes multiple tools. Omit for HTTP resources."),
  method: z
    .string()
    .default("GET")
    .describe("HTTP method to call the resource with."),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .describe("Additional request headers the resource needs (never a payment header - that's added automatically)."),
  body: z
    .string()
    .optional()
    .describe("Request body, if the resource's method needs one."),
};

export const paidCallInputSchema = z.object(paidCallInputShape);
export type PaidCallInput = z.infer<typeof paidCallInputSchema>;

const settlementReceiptSchema = z.object({
  transaction: z.string(),
  network: z.string(),
  payer: z.string().optional(),
  scheme: z.string(),
  asset: z.string(),
  amount: z.string(),
  payTo: z.string(),
  resource: z.string(),
  settledAt: z.string(),
  verified: z.literal(false),
});

export const paidCallOutputSchema = z.object({
  status: z.number(),
  body: z.unknown(),
  receipt: settlementReceiptSchema,
});
export type PaidCallOutput = z.infer<typeof paidCallOutputSchema>;
