import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { DiscoveryClient } from "../clients/discovery-client.js";
import { ResourceClient } from "../clients/resource-client.js";
import { FacilitatorClient } from "../clients/facilitator-client.js";
import { createExactSchemeClient } from "../schemes/exact.js";
import { runPaymentFlow } from "../payment/payment-flow.js";
import type { Signer } from "../payment/signer.js";
import { ErrorCode } from "../errors/codes.js";
import { McpToolError, toMcpToolError } from "../errors/mcp-tool-error.js";
import {
  paidCallInputShape,
  paidCallOutputSchema,
  type PaidCallOutput,
} from "../schemas/paid-call.schema.js";

/**
 * Registers paid_call on the given server.
 *
 * `signer` is injected, built once at boot 
 * - paid_call never constructs one itself from a tool-call argument, and
 * never receives raw key material through its schema.
 *
 * discoveryClient.getResource() is used ONLY to resolve `resource` to a
 * callable URL - its `accepts[]` is never touched here. The actual payment
 * terms come from the seller's own live 402 (resource-client.ts), fetched
 * fresh inside runPaymentFlow; discovery's cached copy can be stale or,
 * for federated entries, data Rialto didn't originate, so it is never
 * authoritative for what to pay (see packages/discovery/README.md's
 * cataloging-integrity note).
 */
export function registerPaidCallTool(
  server: McpServer,
  config: Config,
  signer: Signer | undefined
): void {
  const discoveryClient = new DiscoveryClient(config);
  const resourceClient = new ResourceClient(config);
  const facilitatorClient = new FacilitatorClient(config);

  server.registerTool(
    "paid_call",
    {
      title: "Paid Call",
      description:
        "Pay for and call a resource found via search_resources/get_resource: performs the " +
        "full x402 discover, pay, and retry loop and returns the resource's response plus a " +
        "verifiable settlement receipt.",
      inputSchema: paidCallInputShape,
    },
    async (input) => {
      try {
        if (!signer) {
          throw new McpToolError(
            ErrorCode.INTERNAL_ERROR,
            "no signer configured - set BUYER_STELLAR_PRIVATE_KEY to use paid_call"
          );
        }

        const detail = await discoveryClient.getResource({
          resource: input.resource,
          ...(input.toolName !== undefined ? { toolName: input.toolName } : {}),
        });

        const exactScheme = createExactSchemeClient(signer);

        const result = await runPaymentFlow(
          { resourceClient, facilitatorClient, exactScheme },
          {
            url: detail.resource,
            init: {
              method: input.method,
              ...(input.headers !== undefined ? { headers: input.headers } : {}),
              ...(input.body !== undefined ? { body: input.body } : {}),
            },
          }
        );

        const output: PaidCallOutput = paidCallOutputSchema.parse(result);

        return {
          content: [{ type: "text" as const, text: JSON.stringify(output) }],
        };
      } catch (err) {
        return toMcpToolError(err).toToolResult();
      }
    }
  );
}
