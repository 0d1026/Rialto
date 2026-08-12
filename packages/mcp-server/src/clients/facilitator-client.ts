import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from "@x402/core/types";
import type { Config } from "../config.js";
import { ErrorCode } from "../errors/codes.js";
import { McpToolError } from "../errors/mcp-tool-error.js";

/**
 * Talks to Rialto's own facilitator - trusted, unlike resource-client.ts's
 * arbitrary sellers. Mirrors discovery-client.ts's shape: timeout via
 * FACILITATOR_SERVICE_TIMEOUT_MS (not RIALTO_SERVICE_TIMEOUT_MS - a real
 * /settle call needs real headroom for on-chain confirmation, unlike
 * discovery's fast Postgres-backed calls), every failure normalized
 * through McpToolError.
 */
export class FacilitatorClient {
  constructor(private readonly config: Config) {}

  private authHeader(): Record<string, string> {
    return this.config.FACILITATOR_API_KEY
      ? { authorization: `Bearer ${this.config.FACILITATOR_API_KEY}` }
      : {};
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = new URL(path, this.config.FACILITATOR_URL);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.FACILITATOR_SERVICE_TIMEOUT_MS
    );

    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: { ...this.authHeader(), ...init.headers },
        signal: controller.signal,
      });
    } catch (err) {
      throw new McpToolError(
        ErrorCode.FACILITATOR_UNAVAILABLE,
        `facilitator request to ${path} failed: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new McpToolError(
        ErrorCode.FACILITATOR_UNAVAILABLE,
        `facilitator ${path} returned ${response.status}`
      );
    }

    try {
      return (await response.json()) as T;
    } catch (err) {
      throw new McpToolError(
        ErrorCode.FACILITATOR_UNAVAILABLE,
        `facilitator ${path} returned invalid JSON`,
        err
      );
    }
  }

  async getSupported(): Promise<SupportedResponse> {
    return this.request<SupportedResponse>("/supported", { method: "GET" });
  }

  /**
   * Throws FACILITATOR_VERIFY_REJECTED (carrying the facilitator's own
   * machine-readable reason, per packages/facilitator/README.md) rather than
   * returning an invalid VerifyResponse - callers only ever get here on the
   * accepted path.
   */
  async verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    const result = await this.request<VerifyResponse>("/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentPayload, paymentRequirements }),
    });

    if (!result.isValid) {
      throw new McpToolError(
        ErrorCode.FACILITATOR_VERIFY_REJECTED,
        result.invalidReason ?? "facilitator rejected the payment"
      );
    }

    return result;
  }

  /**
   * Throws FACILITATOR_SETTLE_FAILED on failure, same shape as verify() -
   * callers only ever get a successful SettleResponse back. On-ledger
   * verification of that response is a separate, later concern (receipt.ts
   * only shapes this data; nothing here confirms it on-chain).
   */
  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<SettleResponse> {
    const result = await this.request<SettleResponse>("/settle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentPayload, paymentRequirements }),
    });

    if (!result.success) {
      throw new McpToolError(
        ErrorCode.FACILITATOR_SETTLE_FAILED,
        result.errorReason ?? "facilitator failed to settle the payment"
      );
    }

    return result;
  }
}
