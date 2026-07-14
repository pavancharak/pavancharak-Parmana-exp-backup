import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import type { RazorpayPayment, RazorpayRefund } from "./RazorpayTypes.js";

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
 * /v1/payments/:id/refunds, POST /v1/payments/:id/refund. Anything not
 * stated by the spec (e.g. webhooks, RazorpayX payouts) is out of scope
 * and not simulated here.
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

  refundsFor(paymentId: string): readonly RazorpayRefund[] {
    return this.refunds.get(paymentId) ?? [];
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

    this.respond(res, 404, { error: { description: "Not found" } });
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
