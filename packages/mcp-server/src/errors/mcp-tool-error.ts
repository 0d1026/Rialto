import { ErrorCode } from "./codes.js";

/**
 * Thrown by clients/ and payment/ code; caught at the tools/ boundary and
 * turned into a structured MCP tool error response. Every rejection an
 * agent sees from this server carries a non-null `code` from ErrorCode -
 * never a bare thrown Error, never a missing reason.
 */
export class McpToolError extends Error {
  readonly code: ErrorCode;
  override readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "McpToolError";
    this.code = code;
    this.cause = cause;
  }

  /**
   * Shape returned to the MCP client: `isError: true` plus a single text
   * block containing JSON-encoded { code, message }. Agents match on
   * `code` programmatically rather than string-matching `message`, which
   * is free to change wording without breaking anything downstream.
   */
  toToolResult(): { isError: true; content: [{ type: "text"; text: string }] } {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({ code: this.code, message: this.message }),
        },
      ],
    };
  }
}

/**
 * Normalizes any thrown value into an McpToolError. An unexpected throw (a
 * bug, not a modeled failure) becomes INTERNAL_ERROR rather than leaking a
 * raw stack trace or an undefined reason to the agent - every tool handler
 * routes its catch block through this function, never rethrows raw.
 */
export function toMcpToolError(err: unknown): McpToolError {
  if (err instanceof McpToolError) return err;

  const message = err instanceof Error ? err.message : String(err);
  return new McpToolError(ErrorCode.INTERNAL_ERROR, message, err);
}