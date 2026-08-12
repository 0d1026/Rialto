import type { PaymentRequirements, SupportedResponse } from "@x402/core/types";
import { ErrorCode } from "../errors/codes.js";
import { McpToolError } from "../errors/mcp-tool-error.js";

/**
 * Schemes this buyer can currently build a signed payload for. `upto` joins
 * this set once schemes/upto.ts lands - selection logic itself doesn't
 * change, only this set grows.
 */
const IMPLEMENTED_SCHEMES: ReadonlySet<string> = new Set(["exact"]);

/**
 * Picks one entry from a resource's live `accepts[]` to pay with. Two
 * distinct failure modes, two distinct codes, since an agent would want to
 * react to them differently:
 *  - NO_ACCEPTABLE_PAYMENT_OPTION: nothing in accepts[] matches any
 *    scheme/network this facilitator (per its own /supported response)
 *    actually settles - a facilitator-capability mismatch.
 *  - UNSUPPORTED_SCHEME: the facilitator could settle it, but this buyer
 *    doesn't know how to build a payload for that scheme yet - a
 *    client-capability gap, not a facilitator one.
 */
export function selectPaymentRequirements(
  accepts: PaymentRequirements[],
  supported: SupportedResponse
): PaymentRequirements {
  const settleable = accepts.filter((pr) =>
    supported.kinds.some((kind) => kind.scheme === pr.scheme && kind.network === pr.network)
  );

  if (settleable.length === 0) {
    const offered = accepts.map((pr) => `${pr.scheme}/${pr.network}`).join(", ") || "(none)";
    throw new McpToolError(
      ErrorCode.NO_ACCEPTABLE_PAYMENT_OPTION,
      `none of this resource's accepted payment options (${offered}) match a scheme/network this facilitator settles`
    );
  }

  const implementable = settleable.filter((pr) => IMPLEMENTED_SCHEMES.has(pr.scheme));
  if (implementable.length === 0) {
    const schemes = [...new Set(settleable.map((pr) => pr.scheme))].join(", ");
    throw new McpToolError(
      ErrorCode.UNSUPPORTED_SCHEME,
      `resource only offers schemes this buyer doesn't implement yet: ${schemes}`
    );
  }

  return implementable.find((pr) => pr.scheme === "exact") ?? implementable[0]!;
}
