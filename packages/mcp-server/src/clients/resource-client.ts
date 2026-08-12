import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { PaymentPayload, PaymentRequired } from "@x402/core/types";
import type { Config } from "../config.js";
import { ErrorCode } from "../errors/codes.js";
import { McpToolError } from "../errors/mcp-tool-error.js";

export interface ResourceCallInit {
  method: string;
  headers?: Record<string, string>;
  body?: string;
}

/** The seller didn't 402 - either it's free, or it's broken. Not this client's call to make. */
export interface UnpaidResourceResult {
  kind: "unpaid";
  status: number;
  body: unknown;
}

/**
 * The seller's live 402. `paymentRequired.accepts` is the protocol's actual
 * authority on what to pay - never packages/discovery's cached copy, which
 * can be stale or, for federated entries, data Rialto didn't originate.
 */
export interface PaymentRequiredResult {
  kind: "payment_required";
  status: 402;
  paymentRequired: PaymentRequired;
}

export type ResourceRequestResult = UnpaidResourceResult | PaymentRequiredResult;

export interface PaidResourceResult {
  status: number;
  body: unknown;
}

/**
 * Talks to arbitrary sellers - assume nothing, unlike facilitator-client.ts's
 * trusted facilitator. Holds no scheme registrations: payload signing lives
 * in schemes/exact.ts, so this file only knows the x402 v2 wire format
 * (PAYMENT-REQUIRED / PAYMENT-SIGNATURE headers - confirmed against
 * @x402/core's own client encode/decode helpers, not guessed) and how to
 * issue/retry an HTTP request.
 */
export class ResourceClient {
  private readonly http = new x402HTTPClient(new x402Client());

  constructor(private readonly config: Config) {}

  /** Issues the initial request. A 402 is the protocol working, not an error. */
  async requestResource(url: string, init: ResourceCallInit): Promise<ResourceRequestResult> {
    const response = await this.fetchResource(url, init);
    const body = await this.readBody(response);

    if (response.status !== 402) {
      return { kind: "unpaid", status: response.status, body };
    }

    let paymentRequired: PaymentRequired;
    try {
      paymentRequired = this.http.getPaymentRequiredResponse(
        (name) => response.headers.get(name),
        body
      );
    } catch (err) {
      throw new McpToolError(
        ErrorCode.SELLER_UNREACHABLE,
        `seller returned 402 with no decodable payment-required declaration: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    }

    return { kind: "payment_required", status: 402, paymentRequired };
  }

  /** Re-issues the original request with a signed payment payload attached. */
  async retryWithPayment(
    url: string,
    init: ResourceCallInit,
    paymentPayload: PaymentPayload
  ): Promise<PaidResourceResult> {
    const paymentHeaders = this.http.encodePaymentSignatureHeader(paymentPayload);
    const response = await this.fetchResource(url, {
      ...init,
      headers: { ...init.headers, ...paymentHeaders },
    });
    const body = await this.readBody(response);
    return { status: response.status, body };
  }

  private async fetchResource(url: string, init: ResourceCallInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.SELLER_REQUEST_TIMEOUT_MS
    );
    try {
      return await fetch(url, {
        method: init.method,
        ...(init.headers !== undefined ? { headers: init.headers } : {}),
        ...(init.body !== undefined ? { body: init.body } : {}),
        signal: controller.signal,
      });
    } catch (err) {
      throw new McpToolError(
        ErrorCode.SELLER_UNREACHABLE,
        `request to seller failed: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return response.text();
    }
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }
}
