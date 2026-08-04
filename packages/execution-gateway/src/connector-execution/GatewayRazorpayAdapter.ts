import type {
  Connector,
  ConnectorCapabilities,
  ConnectorExecutionContext,
  ConnectorRequest,
  ConnectorResponse,
} from "@parmana/connector-sdk";

import {
  RAZORPAY_PAYMENT_FETCH_CAPABILITY,
  RAZORPAY_REFUND_CREATE_CAPABILITY,
  RAZORPAY_REFUND_FETCH_CAPABILITY,
  type RazorpayConnectorOptions,
} from "@parmana/connector-sdk";

import {
  PARMANA_TXN_NOTES_KEY,
  RAZORPAY_TEST_MODE_PLACEHOLDER_KEY_ID,
  isRazorpayCredentialValue,
  redactRazorpayKeyId,
  type RazorpayRefund,
  type RazorpayRefundList,
} from "@parmana/connector-sdk";

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
 *
 * Gateway-owned production adapter (Phase 1C) — migrated verbatim from
 * @parmana/connector-sdk's RazorpayConnector; capability identifiers and
 * option/parameter DTOs stayed behind in connector-sdk's
 * RazorpayCapabilities.ts (imported back here), only the executable class
 * moved.
 */
export class GatewayRazorpayAdapter implements Connector {
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

    // Fail closed before any network setup: the built-in test-mode
    // placeholder (createRazorpayCredentialProvider.ts's fallback when no
    // real test-mode credential is configured) is only ever safe against a
    // mock server reached through an explicit baseUrl override. Sent to
    // Razorpay's real API, it can only ever be rejected — but relying on
    // that rejection is an accident of Razorpay's behavior, not a
    // guarantee this codebase controls. Refuse outright instead.
    if (this.baseUrl === DEFAULT_BASE_URL && keyId === RAZORPAY_TEST_MODE_PLACEHOLDER_KEY_ID) {
      throw new Error(
        `RazorpayConnector "${this.connectorId}" refuses to send the built-in test-mode placeholder ` +
          `credential to Razorpay's real API (${DEFAULT_BASE_URL}). This placeholder is only safe against ` +
          "a mock server reached via an explicit baseUrl override. Configure RAZORPAY_TEST_KEY_ID/" +
          "RAZORPAY_TEST_KEY_SECRET (or RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET in production) with real " +
          "credentials, or point baseUrl at a mock server.",
      );
    }

    const authorizationHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), context.timeoutMs);

    try {
      switch (request.capability) {
        case RAZORPAY_PAYMENT_FETCH_CAPABILITY:
          return await this.fetchPayment(request, authorizationHeader, controller.signal, keyId);
        case RAZORPAY_REFUND_CREATE_CAPABILITY:
          return await this.createRefund(request, authorizationHeader, controller.signal, keyId);
        case RAZORPAY_REFUND_FETCH_CAPABILITY:
          return await this.fetchRefund(request, authorizationHeader, controller.signal, keyId);
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
   * FETCH-VERIFY: the read a settlement processor (M4b) makes to
   * confirm a refund's actual state directly from Razorpay, rather than
   * trusting a webhook's claimed event type — a webhook is a doorbell,
   * never a delivery. Returns whatever status Razorpay reports
   * ("processed", "failed", "pending", ...) verbatim; the caller
   * decides what that means, this connector does not interpret it.
   */
  private async fetchRefund(
    request: ConnectorRequest,
    authorizationHeader: string,
    signal: AbortSignal,
    keyId: string,
  ): Promise<ConnectorResponse> {
    const refundId = requireString(request.parameters.refundId, "parameters.refundId");
    const refund = await this.razorpayGet(`/refunds/${refundId}`, authorizationHeader, signal);
    return { success: true, metadata: { refund, keyIdRedacted: redactRazorpayKeyId(keyId) } };
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
