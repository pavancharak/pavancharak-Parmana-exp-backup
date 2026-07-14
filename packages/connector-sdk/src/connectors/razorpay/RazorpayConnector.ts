import type {
  Connector,
  ConnectorCapabilities,
  ConnectorExecutionContext,
  ConnectorRequest,
  ConnectorResponse,
} from "../../ConnectorTypes.js";

import {
  PARMANA_TXN_NOTES_KEY,
  isRazorpayCredentialValue,
  redactRazorpayKeyId,
  type RazorpayRefund,
  type RazorpayRefundList,
  type RazorpayRefundSpeed,
} from "./RazorpayTypes.js";

export const RAZORPAY_PAYMENT_FETCH_CAPABILITY = "razorpay:payment-fetch";
export const RAZORPAY_REFUND_CREATE_CAPABILITY = "razorpay:refund-create";

export interface RazorpayConnectorOptions {
  readonly connectorId: string;
  readonly capabilities: ConnectorCapabilities;

  /** Defaults to Razorpay's production base URL; tests and the tutorial override with a local mock server. */
  readonly baseUrl?: string;
}

export interface RazorpayRefundCreateParameters {
  readonly paymentId: string;
  readonly amountPaise?: number;
  readonly speed?: RazorpayRefundSpeed;
  readonly reason?: string;
  readonly receipt?: string;
}

export interface RazorpayPaymentFetchParameters {
  readonly paymentId: string;
}

const DEFAULT_BASE_URL = "https://api.razorpay.com/v1";

/**
 * Razorpay connector: payment fetch (read, used for preconditions and
 * policy evaluation input) and refund creation (the guarded execution).
 *
 * Not built by literally instantiating the generic HttpConnector: that
 * class derives its HTTP method from an "http:" namespaced capability and
 * only ever injects a Bearer token. Razorpay requires HTTP Basic auth
 * (key_id / key_secret) and multiplexes distinct paths, methods, and
 * request shapes across two business capabilities, so a sibling
 * implementation is used instead, following HttpConnector's own pattern:
 * fetch-based, AbortController timeout, fail-closed on any non-2xx
 * response or network error.
 */
export class RazorpayConnector implements Connector {
  readonly connectorId: string;
  readonly capabilities: ConnectorCapabilities;
  private readonly baseUrl: string;

  constructor(private readonly options: RazorpayConnectorOptions) {
    this.connectorId = options.connectorId;
    this.capabilities = options.capabilities;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    Object.freeze(this);
  }

  async execute(
    request: ConnectorRequest,
    context: ConnectorExecutionContext,
  ): Promise<ConnectorResponse> {
    if (!this.capabilities.includes(request.capability)) {
      throw new Error(
        `RazorpayConnector "${this.connectorId}" does not declare capability "${request.capability}".`,
      );
    }

    if (!isRazorpayCredentialValue(context.credential.value)) {
      throw new Error(
        `RazorpayConnector "${this.connectorId}" received a credential that is not a resolved Razorpay key_id/key_secret pair.`,
      );
    }
    const { keyId, keySecret } = context.credential.value;
    const authorizationHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), context.timeoutMs);

    try {
      switch (request.capability) {
        case RAZORPAY_PAYMENT_FETCH_CAPABILITY:
          return await this.fetchPayment(request, authorizationHeader, controller.signal, keyId);
        case RAZORPAY_REFUND_CREATE_CAPABILITY:
          return await this.createRefund(request, authorizationHeader, controller.signal, keyId);
        default:
          throw new Error(
            `RazorpayConnector "${this.connectorId}" has no handler for capability "${request.capability}".`,
          );
      }
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `RazorpayConnector "${this.connectorId}" request to capability "${request.capability}" ` +
            `timed out after ${context.timeoutMs}ms.`,
          { cause: error },
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchPayment(
    request: ConnectorRequest,
    authorizationHeader: string,
    signal: AbortSignal,
    keyId: string,
  ): Promise<ConnectorResponse> {
    const paymentId = requireString(request.parameters.paymentId, "parameters.paymentId");
    const payment = await this.razorpayGet(`/payments/${paymentId}`, authorizationHeader, signal);
    return { success: true, metadata: { payment, keyIdRedacted: redactRazorpayKeyId(keyId) } };
  }

  /**
   * Application-level idempotency (verified-against-mock-only: Razorpay's
   * spec here is explicitly stated by this milestone, not observed against
   * a live account). Razorpay is not assumed to deduplicate refund
   * requests by receipt or any header, so before creating a refund this
   * lists existing refunds for the payment and treats any refund whose
   * notes carry our transaction id as already executed, returning it
   * instead of calling create again.
   */
  private async createRefund(
    request: ConnectorRequest,
    authorizationHeader: string,
    signal: AbortSignal,
    keyId: string,
  ): Promise<ConnectorResponse> {
    const paymentId = requireString(request.parameters.paymentId, "parameters.paymentId");
    const businessTransactionId = request.businessTransactionId;
    const keyIdRedacted = redactRazorpayKeyId(keyId);

    const existingList = (await this.razorpayGet(
      `/payments/${paymentId}/refunds`,
      authorizationHeader,
      signal,
    )) as RazorpayRefundList;

    const existing = existingList.items.find(
      (refund) => refund.notes?.[PARMANA_TXN_NOTES_KEY] === businessTransactionId,
    );

    if (existing !== undefined) {
      return { success: true, metadata: { refund: existing, idempotent: true, keyIdRedacted } };
    }

    const amountPaise = request.parameters.amountPaise;
    const speed = request.parameters.speed;
    const reason = request.parameters.reason;
    const receipt = request.parameters.receipt;

    const body: Record<string, unknown> = {
      notes: {
        [PARMANA_TXN_NOTES_KEY]: businessTransactionId,
        ...(typeof reason === "string" ? { reason } : {}),
      },
    };
    if (typeof amountPaise === "number") body.amount = amountPaise;
    if (typeof speed === "string") body.speed = speed;
    if (typeof receipt === "string") body.receipt = receipt;

    const created = (await this.razorpayPost(
      `/payments/${paymentId}/refund`,
      body,
      authorizationHeader,
      signal,
    )) as RazorpayRefund;

    return { success: true, metadata: { refund: created, idempotent: false, keyIdRedacted } };
  }

  private async razorpayGet(path: string, authorizationHeader: string, signal: AbortSignal): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      signal,
      headers: { Authorization: authorizationHeader },
    });
    return this.parseOrFailClosed(response);
  }

  private async razorpayPost(
    path: string,
    body: Record<string, unknown>,
    authorizationHeader: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: authorizationHeader,
      },
      body: JSON.stringify(body),
    });
    return this.parseOrFailClosed(response);
  }

  private async parseOrFailClosed(response: Response): Promise<unknown> {
    if (!response.ok) {
      throw new Error(
        `RazorpayConnector "${this.connectorId}" request failed with HTTP ${response.status}.`,
      );
    }
    return response.json().catch(() => ({}));
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`RazorpayConnector request is missing required field "${field}".`);
  }
  return value;
}
