import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import type { RazorpayPayment, RazorpayRefund, RazorpayRefundStatus } from "./RazorpayTypes.js";

export interface MockRazorpayServerOptions {
  readonly keyId: string;
  readonly keySecret: string;
}

/**
 * Local, in-memory stand-in for Razorpay's Payments and Refunds API,
 * hermetic and deterministic, used by both the test suite and tutorial 61
 * so both exercise the exact same simulated behavior. Never makes or
 * receives real network traffic beyond localhost.
 *
 * Behavior is deliberately conservative and matches only what this
 * milestone's spec states about Razorpay: GET /v1/payments/:id, GET
 * /v1/payments/:id/refunds, POST /v1/payments/:id/refund, GET
 * /v1/refunds/:id. Anything not stated by the spec (e.g. webhook
 * delivery, RazorpayX payouts) is out of scope and not simulated here —
 * M4b's tests simulate a webhook delivery by signing a payload directly
 * and POSTing it to the real webhook route, not through this server.
 */
export class MockRazorpayServer {
  private server: Server | undefined;
  private baseUrlValue = "";
  private readonly payments = new Map<string, RazorpayPayment>();
  private readonly refunds = new Map<string, RazorpayRefund[]>();
  private responseDelayMs = 0;

  constructor(private readonly options: MockRazorpayServerOptions) {}

  get baseUrl(): string {
    return this.baseUrlValue;
  }

  /** Test-only hook: delays every response, used to exercise connector timeout handling. */
  setResponseDelayMs(delayMs: number): void {
    this.responseDelayMs = delayMs;
  }

  setPayment(payment: RazorpayPayment): void {
    this.payments.set(payment.id, payment);
  }

  /**
   * Test-only hook: inserts a refund object exactly as given, arbitrary
   * id included, bypassing the normal create flow (which always assigns
   * a randomly generated id). Used to seed a mock refund whose id must
   * match one an external source already assigned — e.g. a hermetic
   * fixture replaying a real, externally captured Razorpay webhook
   * delivery, whose payload references a specific real refund id that
   * the create flow cannot reproduce.
   */
  seedExistingRefund(paymentId: string, refund: RazorpayRefund): void {
    const list = this.refunds.get(paymentId) ?? [];
    list.push(refund);
    this.refunds.set(paymentId, list);
  }

  refundsFor(paymentId: string): readonly RazorpayRefund[] {
    return this.refunds.get(paymentId) ?? [];
  }

  /**
   * Test-only hook: forces an existing refund's status, used to
   * simulate Razorpay reporting "failed" (or any other status) from
   * GET /refunds/:id — real Razorpay refunds always start "processed"
   * from a create call, so a test needing a different fetched state
   * mutates it directly here rather than this server inventing failure
   * scenarios createRefund itself never produces.
   */
  setRefundStatus(refundId: string, status: RazorpayRefundStatus): void {
    for (const [paymentId, list] of this.refunds) {
      const index = list.findIndex((refund) => refund.id === refundId);
      if (index !== -1) {
        const updated = [...list];
        updated[index] = { ...updated[index]!, status };
        this.refunds.set(paymentId, updated);
        return;
      }
    }
  }

  async listen(): Promise<void> {
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((error: unknown) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : "unknown error" }));
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    const address = this.server!.address() as AddressInfo;
    this.baseUrlValue = `http://127.0.0.1:${address.port}/v1`;
  }

  async close(): Promise<void> {
    if (this.server === undefined) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.authenticates(req)) {
      this.respond(res, 401, { error: { description: "Authentication failed" } });
      return;
    }

    const url = req.url ?? "";
    const method = req.method ?? "GET";

    const paymentMatch = /^\/v1\/payments\/([^/]+)$/.exec(url);
    if (method === "GET" && paymentMatch) {
      this.handleFetchPayment(res, paymentMatch[1]!);
      return;
    }

    const refundsListMatch = /^\/v1\/payments\/([^/]+)\/refunds$/.exec(url);
    if (method === "GET" && refundsListMatch) {
      this.handleListRefunds(res, refundsListMatch[1]!);
      return;
    }

    const refundCreateMatch = /^\/v1\/payments\/([^/]+)\/refund$/.exec(url);
    if (method === "POST" && refundCreateMatch) {
      const body = await this.readJsonBody(req);
      this.handleCreateRefund(res, refundCreateMatch[1]!, body);
      return;
    }

    const refundFetchMatch = /^\/v1\/refunds\/([^/]+)$/.exec(url);
    if (method === "GET" && refundFetchMatch) {
      this.handleFetchRefund(res, refundFetchMatch[1]!);
      return;
    }

    this.respond(res, 404, { error: { description: "Not found" } });
  }

  private handleFetchRefund(res: ServerResponse, refundId: string): void {
    for (const list of this.refunds.values()) {
      const found = list.find((refund) => refund.id === refundId);
      if (found !== undefined) {
        this.respond(res, 200, found);
        return;
      }
    }
    this.respond(res, 404, { error: { description: "The id provided does not exist" } });
  }

  private handleFetchPayment(res: ServerResponse, paymentId: string): void {
    const payment = this.payments.get(paymentId);
    if (payment === undefined) {
      this.respond(res, 404, { error: { description: "The id provided does not exist" } });
      return;
    }
    this.respond(res, 200, payment);
  }

  private handleListRefunds(res: ServerResponse, paymentId: string): void {
    const items = this.refundsFor(paymentId);
    this.respond(res, 200, { entity: "collection", count: items.length, items });
  }

  private handleCreateRefund(res: ServerResponse, paymentId: string, body: Record<string, unknown>): void {
    const payment = this.payments.get(paymentId);
    if (payment === undefined) {
      this.respond(res, 404, { error: { description: "The id provided does not exist" } });
      return;
    }

    const remaining = payment.amount - payment.amount_refunded;
    const amount = typeof body.amount === "number" ? body.amount : remaining;
    const notes = (body.notes as Record<string, string> | undefined) ?? {};

    const refund: RazorpayRefund = {
      id: `rfnd_${randomBytes(7).toString("hex")}`,
      entity: "refund",
      payment_id: paymentId,
      amount,
      currency: payment.currency,
      status: "processed",
      speed_processed: (body.speed as "normal" | "optimum" | undefined) ?? "normal",
      notes,
      ...(typeof body.receipt === "string" ? { receipt: body.receipt } : {}),
      created_at: Math.floor(Date.now() / 1000),
    };

    const updatedRefunded = payment.amount_refunded + amount;
    this.payments.set(paymentId, {
      ...payment,
      amount_refunded: updatedRefunded,
      status: updatedRefunded >= payment.amount ? "refunded" : payment.status,
    });

    const list = this.refunds.get(paymentId) ?? [];
    list.push(refund);
    this.refunds.set(paymentId, list);

    this.respond(res, 200, refund);
  }

  private authenticates(req: IncomingMessage): boolean {
    const header = req.headers.authorization;
    if (header === undefined || !header.startsWith("Basic ")) return false;
    const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
    return decoded === `${this.options.keyId}:${this.options.keySecret}`;
  }

  private async readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    if (raw.length === 0) return {};
    return JSON.parse(raw) as Record<string, unknown>;
  }

  private respond(res: ServerResponse, status: number, body: unknown): void {
    setTimeout(() => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    }, this.responseDelayMs);
  }
}
