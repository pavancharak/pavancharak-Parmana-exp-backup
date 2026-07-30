import { createHash, createHmac, randomUUID } from "node:crypto";

import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { BusinessTransaction } from "@parmana/shared";
import { SettlementStatus } from "@parmana/shared";
import {
  PARMANA_TXN_NOTES_KEY,
  RAZORPAY_PAYMENT_FETCH_CAPABILITY,
  RAZORPAY_REFUND_CREATE_CAPABILITY,
  RAZORPAY_REFUND_FETCH_CAPABILITY,
  RazorpayConnector,
  StaticCredentialProvider,
  connectorCapabilities,
  type RazorpayRefund,
  type RazorpayRefundList,
} from "@parmana/connector-sdk";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { createExecutionSystem } from "../../src/bootstrap/createExecutionSystem.js";
import { executionTrustRecordRepository } from "../../src/repositories.js";
import { RazorpaySettlementProcessor } from "../../src/webhooks/RazorpaySettlementProcessor.js";
import { InMemoryRazorpayWebhookEventStore } from "../../src/webhooks/InMemoryRazorpayWebhookEventStore.js";
import { InMemoryRazorpayWebhookAuditSink } from "../../src/webhooks/InMemoryRazorpayWebhookAuditSink.js";

import {
  resolveRazorpayLiveGate,
  resolveRazorpayCapturedPaymentGate,
} from "../helpers/razorpay-live-availability.js";

function signHmac(body: string, secret: string): string {
  return createHmac("sha256", secret).update(Buffer.from(body)).digest("hex");
}

const razorpayLiveConfigured = resolveRazorpayLiveGate(
  "Razorpay Live Test-Mode Integration",
);

/**
 * Third gating tier (see resolveRazorpayCapturedPaymentGate's comment):
 * only consulted once the base live gate above is already active, so a
 * machine with TEST_RAZORPAY_CAPTURED_PAYMENT_ID set but no opt-in never
 * even evaluates it.
 */
const capturedPaymentId = razorpayLiveConfigured
  ? resolveRazorpayCapturedPaymentGate("Razorpay Live Refund Creation")
  : undefined;

/** Fixed, deliberate: never refund more than this in a live test run. */
const REFUND_AMOUNT_PAISE = 100;

/**
 * Deterministic per invocation, given a seed: same seed always produces
 * the same well-formed UUID (the businessTransactionId route guard —
 * packages/api/src/routes/execute.ts's isValidBusinessTransactionId —
 * requires the literal UUID shape, not just any string). Used to derive
 * one businessTransactionId per suite run (seeded from a run timestamp,
 * per the repeatability requirement — see this file's money-moving
 * describe block and packages/api/README.md), not for any
 * cryptographic property.
 */
function deterministicUuidFromSeed(seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex");
  const variant = "89ab"[parseInt(hash[16] as string, 16) % 4];
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${variant}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

/**
 * The first network call this codebase ever makes to a real Razorpay
 * endpoint (api.razorpay.com), in TEST MODE only, gated exactly like
 * supabase-caller-audit-sink.integration.test.ts / workflow-supabase.
 * integration.test.ts gate on ALLOW_LIVE_SUPABASE — see
 * resolveRazorpayLiveGate's comment and packages/api/README.md.
 *
 * Two independent gating tiers govern this file (a third layers on top —
 * see the nested "Razorpay live refund creation" describe block below):
 *
 *   1. ALLOW_LIVE_RAZORPAY=1 + RAZORPAY_TEST_KEY_ID (rzp_test_-prefixed,
 *      checked before any network call) + RAZORPAY_TEST_KEY_SECRET —
 *      gates this entire file. Absent: everything below skips cleanly.
 *
 * Boundary exercised by the two tests directly in this describe block
 * (see docs/CLAIMS.md 3.4 for the precise claim): both target a
 * deliberately non-existent payment id and drive the full production
 * chain (POST /execute -> envelope verification -> ExecutionGateway ->
 * RazorpayConnector -> https://api.razorpay.com/v1) far enough to
 * observe Razorpay's own real HTTP response, without ever reaching a
 * money-moving call:
 *
 *   - razorpay:payment-fetch performs one real GET /payments/:id.
 *   - razorpay:refund-create performs one real GET /payments/:id/refunds
 *     (the pre-create idempotency listing call — RazorpayConnector.
 *     createRefund, packages/connector-sdk/src/connectors/razorpay/
 *     RazorpayConnector.ts) and, because the payment does not exist,
 *     Razorpay rejects that GET before the connector ever reaches the
 *     POST /payments/:id/refund call.
 *
 * The API's error handler (packages/api/src/middleware/error-handler.ts)
 * does not forward connector-thrown error detail into the HTTP response
 * body (a plain Error falls to its generic 500 "Internal Server Error"
 * branch), so the live-reachability proof itself — that a genuine
 * Razorpay HTTP response, not a network failure, produced the error — is
 * captured independently here via a fetch spy that observes the real
 * response without altering it, rather than by parsing the response
 * body.
 */
describe.skipIf(!razorpayLiveConfigured)(
  "Razorpay live test-mode (HTTP boundary)",
  () => {
    const originalRazorpayBaseUrl = process.env.RAZORPAY_BASE_URL;

    let app: ReturnType<typeof createApp>;
    let application: ReturnType<typeof createApplication>;

    beforeAll(() => {
      // No bridge needed: createRazorpayCredentialProvider.ts's
      // NODE_ENV=test branch reads RAZORPAY_TEST_KEY_ID/
      // RAZORPAY_TEST_KEY_SECRET directly — the same names documented in
      // .env.example — so the real test-mode key/secret pair already
      // sitting in the environment is picked up with no test-side
      // mutation, and never appears in a variable, log, or assertion
      // below.

      // No RAZORPAY_BASE_URL override: RazorpayConnector falls back to
      // its own default, Razorpay's real base URL
      // (https://api.razorpay.com/v1).
      delete process.env.RAZORPAY_BASE_URL;

      const executionSystem = createExecutionSystem();
      application = createApplication(executionSystem);
      app = createApp(application, { callerAuth: "disabled", razorpayWebhook: "disabled" });
    });

    afterAll(() => {
      if (originalRazorpayBaseUrl === undefined) {
        delete process.env.RAZORPAY_BASE_URL;
      } else {
        process.env.RAZORPAY_BASE_URL = originalRazorpayBaseUrl;
      }
    });

    interface ObservedCall {
      method: string;
      url: string;
      status: number;
      requestBody?: unknown;
    }

    let realFetch: typeof fetch;
    let fetchSpy: ReturnType<typeof vi.spyOn>;
    let observed: ObservedCall[] = [];

    beforeAll(() => {
      realFetch = globalThis.fetch.bind(globalThis);
      fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (input, init) => {
          const response = await realFetch(input, init);
          observed.push({
            method: init?.method ?? "GET",
            url: String(input),
            status: response.status,
            requestBody:
              typeof init?.body === "string"
                ? (JSON.parse(init.body) as unknown)
                : undefined,
          });
          // Returned untouched (body never consumed here) so production
          // behavior — including RazorpayConnector's own
          // parseOrFailClosed handling — is entirely unaffected.
          return response;
        });
    });

    afterAll(() => {
      fetchSpy.mockRestore();
    });

    afterEach(() => {
      observed = [];
    });

    function liveTransaction(overrides: {
      action: string;
      target: string;
      paymentId: string;
      amountPaise: number;
      businessTransactionId?: string;
      signals?: Record<string, unknown>;
      /** Only razorpay:refund-fetch reads this; every other action ignores it. */
      refundId?: string;
    }): BusinessTransaction {
      const businessTransactionId =
        overrides.businessTransactionId ?? randomUUID();
      const authorityId = randomUUID();
      const authorizationId = randomUUID();
      const intentId = randomUUID();

      return {
        businessTransactionId,

        metadata: {
          businessTransactionId,
          correlationId: randomUUID(),
          createdBy: "razorpay-live-integration-test",
          createdAt: new Date(),
        },

        authority: {
          authorityId,
          authorityType: "USER",
          principalId: "razorpay-live-integration-test",
          displayName: "Razorpay Live Integration Test",
          issuedAt: new Date(),
        },

        authorization: {
          authorizationId,
          authorityId,
          purpose: "Razorpay live test-mode integration test",
          authorizedAt: new Date(),
        },

        intent: {
          intentId,
          authorizationId,
          action: overrides.action,
          target: overrides.target,
          parameters: Object.freeze({
            paymentId: overrides.paymentId,
            amountPaise: overrides.amountPaise,
            reason: "razorpay live integration test",
            ...(overrides.refundId !== undefined ? { refundId: overrides.refundId } : {}),
          }),
          createdAt: new Date(),
        },

        // Reused deliberately: no dedicated payment-fetch policy pack
        // exists. Policy evaluation is generic over caller-supplied
        // signals and independent of which capability intent.action
        // names (see razorpay-refund.integration.test.ts's own comment
        // and the ExecutionGateway/PolicyEngine chain it documents) —
        // this pack's APPROVE rule is satisfied by the default signals
        // below for every action exercised in this file.
        policy: {
          name: "razorpay-refund",
          version: "1.0.0",
          schemaVersion: "1.0.0",
        },

        signals: overrides.signals ?? {
          paymentStatus: "captured",
          paymentCurrency: "INR",
          refundableRemainingPaise: overrides.amountPaise,
          requestedRefundAmountPaise: overrides.amountPaise,
          requestedExceedsRemainder: false,
          dailyCumulativeAfterThisRefundPaise: overrides.amountPaise,
        },

        decision: { outcome: "APPROVED" },
        status: "APPROVED",
        createdAt: new Date(),
      } as unknown as BusinessTransaction;
    }

    // Fixed, deliberately non-existent payment id: real enough to be
    // well-formed, but guaranteed never to exist in any Razorpay
    // account, so these two tests can never move real (even test-mode)
    // money no matter which account the supplied keys belong to.
    const NON_EXISTENT_PAYMENT_ID = "pay_ParmanaLiveDoesNotExist00";

    it(
      "drives razorpay:payment-fetch through a real POST /execute to the live Razorpay test-mode API",
      async () => {
        const transaction = liveTransaction({
          action: "razorpay:payment-fetch",
          target: `razorpay://payments/${NON_EXISTENT_PAYMENT_ID}`,
          paymentId: NON_EXISTENT_PAYMENT_ID,
          amountPaise: 100,
        });

        const response = await request(app).post("/execute").send(transaction);

        // The connector's real error detail is swallowed by the generic
        // error handler (see file-level comment) — this only proves the
        // full chain ran and reached the connector's failure path.
        expect(response.status).toBe(500);
        expect(response.body.error).toBe("Internal Server Error");

        // The independent, out-of-band proof that this specific failure
        // came from a genuine Razorpay HTTP response, not a network
        // failure or a bug that never left this process: exactly one
        // real call landed on api.razorpay.com, and a real client-error
        // status came back. observed only gets an entry once fetch()
        // has actually resolved a response — a DNS failure, connection
        // refused, or timeout throws before this array is ever
        // populated, so any recorded 4xx here (whichever specific code —
        // a real account run has observed both 401, when the supplied
        // key's scope does not permit payments:read, and 404, from the
        // sibling refund-listing test below) is proof of a genuine round
        // trip, not proof of which specific rejection reason Razorpay
        // chose.
        const razorpayCalls = observed.filter((entry) =>
          entry.url.startsWith("https://api.razorpay.com/v1/payments/"),
        );
        expect(razorpayCalls).toHaveLength(1);
        expect(razorpayCalls[0]?.url).toBe(
          `https://api.razorpay.com/v1/payments/${NON_EXISTENT_PAYMENT_ID}`,
        );
        expect(razorpayCalls[0]?.status).toBeGreaterThanOrEqual(400);
      },
      30_000,
    );

    it(
      "drives razorpay:refund-create through a real POST /execute far enough to reach the live idempotency-listing GET, and never creates a refund",
      async () => {
        const transaction = liveTransaction({
          action: "razorpay:refund-create",
          target: `razorpay://payments/${NON_EXISTENT_PAYMENT_ID}/refund`,
          paymentId: NON_EXISTENT_PAYMENT_ID,
          amountPaise: 100,
        });

        const response = await request(app).post("/execute").send(transaction);

        expect(response.status).toBe(500);
        expect(response.body.error).toBe("Internal Server Error");

        // Proves the pre-create idempotency-listing GET (the "exercise
        // the idempotency listing logic for real" requirement) actually
        // reached Razorpay live, and that this is the ONLY call made —
        // i.e. the money-moving POST /payments/:id/refund was never
        // reached, because Razorpay rejected the GET first.
        const razorpayCalls = observed.filter((entry) =>
          entry.url.startsWith("https://api.razorpay.com/v1/payments/"),
        );
        expect(razorpayCalls).toHaveLength(1);
        expect(razorpayCalls[0]?.url).toBe(
          `https://api.razorpay.com/v1/payments/${NON_EXISTENT_PAYMENT_ID}/refunds`,
        );
        expect(razorpayCalls[0]?.status).toBeGreaterThanOrEqual(400);

        const refundCreateCalls = observed.filter((entry) =>
          entry.url.endsWith("/refund"),
        );
        expect(refundCreateCalls).toHaveLength(0);
      },
      30_000,
    );

    /**
     * Third gating tier: TEST_RAZORPAY_CAPTURED_PAYMENT_ID (see
     * resolveRazorpayCapturedPaymentGate's comment). This is the only
     * place in the suite that ever creates a real Razorpay object —
     * everything above targets a payment guaranteed not to exist.
     *
     * Repeatability: capturedPaymentId names one manually pre-captured
     * test-mode payment (see packages/api/README.md for how to mint
     * one — Razorpay test-mode payments can only be captured through
     * client-side Checkout, so this cannot be automated headlessly here).
     * That SAME payment is expected to survive repeated suite runs: each
     * run derives its own refund's businessTransactionId deterministically
     * from a fresh run timestamp (deterministicUuidFromSeed below), so
     * every run creates a genuinely NEW 100-paise refund against it — the
     * payment's refundable remainder depletes by exactly 100 paise per
     * run. See README for how to tell when it's exhausted and how to
     * mint a replacement.
     */
    describe.skipIf(capturedPaymentId === undefined)(
      "Razorpay live refund creation (money-moving)",
      () => {
        const paymentId = capturedPaymentId as string;
        const refundTransactionId = deterministicUuidFromSeed(
          `razorpay-live-refund-${Date.now()}`,
        );
        let capturedRazorpayRefundId: string | undefined;

        /**
         * Test-side verification oracle: an independent, read-only
         * Razorpay call made OUTSIDE the production chain under test,
         * exactly mirroring workflow-supabase.integration.test.ts's own
         * "a fresh client... proves the row survives independently of
         * the writer's own client/process" pattern. Uses realFetch
         * directly (bypassing the fetchSpy/observed instrumentation,
         * which exists to trace the SYSTEM UNDER TEST's own calls, not
         * this file's verification reads) and constructs Basic auth the
         * same way RazorpayConnector does — not a "direct connector
         * call" (RazorpayConnector's class/business logic — policy,
         * idempotency matching, evidence building — is never invoked
         * here), just a plain HTTP GET used purely to assert against
         * real Razorpay state.
         */
        async function fetchRefundsLive(
          targetPaymentId: string,
        ): Promise<readonly RazorpayRefund[]> {
          const keyId = process.env.RAZORPAY_TEST_KEY_ID as string;
          const keySecret = process.env.RAZORPAY_TEST_KEY_SECRET as string;
          const authorizationHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

          const response = await realFetch(
            `https://api.razorpay.com/v1/payments/${targetPaymentId}/refunds`,
            {
              method: "GET",
              headers: { Authorization: authorizationHeader },
            },
          );
          const body = (await response.json()) as RazorpayRefundList;
          return body.items;
        }

        it(
          "creates a real 100-paise refund against the captured test-mode payment through a full POST /execute",
          async () => {
            const transaction = liveTransaction({
              action: "razorpay:refund-create",
              target: `razorpay://payments/${paymentId}/refund`,
              paymentId,
              amountPaise: REFUND_AMOUNT_PAISE,
              businessTransactionId: refundTransactionId,
            });

            // The request itself must carry exactly 100 paise.
            expect(
              (transaction.intent.parameters as { amountPaise: number })
                .amountPaise,
            ).toBe(REFUND_AMOUNT_PAISE);

            const response = await request(app).post("/execute").send(transaction);

            expect(response.status).toBe(200);

            const refund = response.body?.executions?.[0]?.evidence?.attributes
              ?.connector?.responseSummary?.metadata?.refund as
              | RazorpayRefund
              | undefined;

            expect(refund).toBeDefined();
            expect(refund?.amount).toBe(REFUND_AMOUNT_PAISE);
            expect(refund?.notes?.[PARMANA_TXN_NOTES_KEY]).toBe(
              refundTransactionId,
            );

            // Observed-call trace: the pre-create idempotency-listing GET
            // (no match yet, first time for this transaction id), then
            // the money-moving POST, carrying exactly 100 paise.
            const razorpayCalls = observed.filter((entry) =>
              entry.url.includes(`/payments/${paymentId}`),
            );
            const listingCall = razorpayCalls.find(
              (entry) => entry.method === "GET" && entry.url.endsWith("/refunds"),
            );
            const createCall = razorpayCalls.find(
              (entry) => entry.method === "POST" && entry.url.endsWith("/refund"),
            );
            expect(listingCall).toBeDefined();
            expect(createCall).toBeDefined();
            expect(
              (createCall?.requestBody as { amount?: number } | undefined)
                ?.amount,
            ).toBe(REFUND_AMOUNT_PAISE);

            capturedRazorpayRefundId = refund?.id;
          },
          30_000,
        );

        /**
         * Closes the refund's lifecycle live (M4b), against the SAME
         * real refund the previous test just created — no public URL
         * involved. This is NOT a claim that Razorpay itself delivered
         * a webhook: it proves the full M4b signature-verification and
         * fetch-verify machinery closes a real refund's lifecycle when
         * *something* correctly signed arrives, using a webhook payload
         * this test constructs and signs itself (see docs/CLAIMS.md for
         * exactly what this does and does not prove, and the captured-
         * payload-fixture gap that would close it).
         */
        it(
          "closes the refund lifecycle live: polls live fetch-verify until processed, then a locally-injected, correctly-signed webhook produces a real settlement confirmation",
          async () => {
            expect(capturedRazorpayRefundId).toBeDefined();
            const razorpayRefundId = capturedRazorpayRefundId as string;

            // Poll live fetch-verify (the same razorpay:refund-fetch
            // capability M4b's processor uses) through the full
            // production POST /execute chain until Razorpay reports the
            // refund as "processed" — test-mode refunds are typically
            // instant, but this does not assume that.
            let fetchedStatus: string | undefined;
            for (let attempt = 0; attempt < 5 && fetchedStatus !== "processed"; attempt++) {
              const fetchTransaction = liveTransaction({
                action: "razorpay:refund-fetch",
                target: `razorpay://refunds/${razorpayRefundId}`,
                paymentId,
                amountPaise: REFUND_AMOUNT_PAISE,
                businessTransactionId: randomUUID(),
                refundId: razorpayRefundId,
                signals: {
                  paymentStatus: "captured",
                  paymentCurrency: "INR",
                  refundableRemainingPaise: REFUND_AMOUNT_PAISE,
                  requestedRefundAmountPaise: REFUND_AMOUNT_PAISE,
                  requestedExceedsRemainder: false,
                  dailyCumulativeAfterThisRefundPaise: REFUND_AMOUNT_PAISE,
                },
              });

              const fetchResponse = await request(app).post("/execute").send(fetchTransaction);
              expect(fetchResponse.status).toBe(200);

              const fetchedRefund = fetchResponse.body?.executions?.[0]?.evidence?.attributes
                ?.connector?.responseSummary?.metadata?.refund as { status?: string } | undefined;
              fetchedStatus = fetchedRefund?.status;

              if (fetchedStatus !== "processed") {
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }
            }
            expect(fetchedStatus).toBe("processed");

            // Locally-injected, correctly-signed webhook event: signed
            // with RAZORPAY_TEST_WEBHOOK_SECRET if configured, else the
            // built-in test placeholder (mirrors resolveRazorpayWebhookSecret.ts's
            // own test-mode split — NODE_ENV=test here too).
            const webhookSecret =
              process.env.RAZORPAY_TEST_WEBHOOK_SECRET ?? "razorpay-webhook-test-placeholder-secret";

            const webhookEventStore = new InMemoryRazorpayWebhookEventStore();
            const webhookAuditSink = new InMemoryRazorpayWebhookAuditSink();

            const webhookApp = createApp(application, {
              callerAuth: "disabled",
              razorpayWebhook: { secret: webhookSecret, eventStore: webhookEventStore, auditSink: webhookAuditSink },
            });

            const webhookBody = JSON.stringify({
              entity: "event",
              event: "refund.processed",
              payload: {
                refund: {
                  entity: {
                    id: razorpayRefundId,
                    payment_id: paymentId,
                    amount: REFUND_AMOUNT_PAISE,
                    status: "processed",
                    notes: { [PARMANA_TXN_NOTES_KEY]: refundTransactionId },
                  },
                },
              },
              created_at: Math.floor(Date.now() / 1000),
            });
            const webhookSignature = signHmac(webhookBody, webhookSecret);

            const webhookResponse = await request(webhookApp)
              .post("/webhooks/razorpay")
              .set("Content-Type", "application/json")
              .set("X-Razorpay-Signature", webhookSignature)
              .set("X-Razorpay-Event-Id", `evt_live_${randomUUID()}`)
              .send(webhookBody);

            expect(webhookResponse.status).toBe(200);
            expect(webhookResponse.body.status).toBe("accepted");

            // Settlement processing, out-of-band, against the REAL
            // Razorpay API (no baseUrl override) with the REAL
            // credentials already resolved for this whole describe
            // block.
            const settlementConnector = new RazorpayConnector({
              connectorId: "razorpay",
              capabilities: connectorCapabilities([
                RAZORPAY_PAYMENT_FETCH_CAPABILITY,
                RAZORPAY_REFUND_CREATE_CAPABILITY,
                RAZORPAY_REFUND_FETCH_CAPABILITY,
              ]),
            });
            const settlementCredentialProvider = new StaticCredentialProvider({
              razorpay: {
                keyId: process.env.RAZORPAY_TEST_KEY_ID as string,
                keySecret: process.env.RAZORPAY_TEST_KEY_SECRET as string,
              },
            });

            const processor = new RazorpaySettlementProcessor({
              eventStore: webhookEventStore,
              trustRecords: executionTrustRecordRepository,
              auditSink: webhookAuditSink,
              connector: settlementConnector,
              credentialProvider: settlementCredentialProvider,
            });

            const summary = await processor.runOnce();
            expect(summary.confirmed).toBe(1);

            const record = await executionTrustRecordRepository.findByTransactionId(refundTransactionId);
            expect(record?.settlementConfirmations).toHaveLength(1);
            expect(record?.settlementConfirmations?.[0]?.status).toBe(SettlementStatus.SETTLED);
            expect(record?.settlementConfirmations?.[0]?.fetchedRefundStatus).toBe("processed");
            expect(record?.settlementConfirmations?.[0]?.razorpayRefundId).toBe(razorpayRefundId);
          },
          60_000,
        );

        it(
          "rejects a same-transaction-id repeat before any second Razorpay call, and a live listing confirms exactly one refund carries this transaction id",
          async () => {
            const transaction = liveTransaction({
              action: "razorpay:refund-create",
              target: `razorpay://payments/${paymentId}/refund`,
              paymentId,
              amountPaise: REFUND_AMOUNT_PAISE,
              // Same businessTransactionId as the create test above —
              // the repeat this test proves is idempotent.
              businessTransactionId: refundTransactionId,
            });

            const response = await request(app).post("/execute").send(transaction);

            // Not RazorpayRefundService's local outcome cache (that
            // class is unreachable from this HTTP route entirely — see
            // this file's header comment) and not RazorpayConnector's
            // own pre-create listing check (it never gets the chance to
            // run). The repeat is answered a layer earlier still:
            // BusinessTransactionService.accept() (packages/runtime/src/
            // services/business-transaction-service.ts) rejects on
            // businessTransactionId uniqueness before RuntimeEngine,
            // policy evaluation, or the connector are ever invoked.
            expect(response.status).toBe(409);
            expect(response.body.error).toContain(refundTransactionId);
            expect(response.body.error).toContain("already exists");

            // The strongest possible proof of "no second refund
            // created": not even a network call was made for this
            // repeat — zero entries, not merely zero POSTs.
            const razorpayCalls = observed.filter((entry) =>
              entry.url.includes("api.razorpay.com"),
            );
            expect(razorpayCalls).toHaveLength(0);

            // Independent, out-of-band live confirmation (see
            // fetchRefundsLive's comment): exactly one refund for this
            // payment carries this transaction id, and it is the
            // 100-paise refund from the create test above — not a
            // second one.
            const refunds = await fetchRefundsLive(paymentId);
            const matching = refunds.filter(
              (refund) => refund.notes?.[PARMANA_TXN_NOTES_KEY] === refundTransactionId,
            );
            expect(matching).toHaveLength(1);
            expect(matching[0]?.amount).toBe(REFUND_AMOUNT_PAISE);
          },
          30_000,
        );

        it(
          "denies a refund exceeding the real refundable remainder via policy, before any Razorpay call",
          async () => {
            // Discover the REAL remainder after the create test's
            // refund, through the full production chain
            // (razorpay:payment-fetch) — not guessed or hardcoded.
            const remainderCheckTransaction = liveTransaction({
              action: "razorpay:payment-fetch",
              target: `razorpay://payments/${paymentId}`,
              paymentId,
              amountPaise: REFUND_AMOUNT_PAISE,
              businessTransactionId: randomUUID(),
            });

            const fetchResponse = await request(app)
              .post("/execute")
              .send(remainderCheckTransaction);

            expect(fetchResponse.status).toBe(200);

            const payment = fetchResponse.body?.executions?.[0]?.evidence
              ?.attributes?.connector?.responseSummary?.metadata?.payment as
              | { amount: number; amount_refunded: number }
              | undefined;

            expect(payment).toBeDefined();

            const realRemainderPaise =
              (payment as { amount: number; amount_refunded: number }).amount -
              (payment as { amount: number; amount_refunded: number })
                .amount_refunded;
            const excessiveAmountPaise = realRemainderPaise + REFUND_AMOUNT_PAISE;

            // Isolate the denial call's own observed-calls trace from
            // the remainder-discovery payment-fetch call above.
            observed = [];

            const denialTransaction = liveTransaction({
              action: "razorpay:refund-create",
              target: `razorpay://payments/${paymentId}/refund`,
              paymentId,
              amountPaise: excessiveAmountPaise,
              businessTransactionId: randomUUID(),
              signals: {
                paymentStatus: "captured",
                paymentCurrency: "INR",
                refundableRemainingPaise: realRemainderPaise,
                requestedRefundAmountPaise: excessiveAmountPaise,
                requestedExceedsRemainder: true,
                dailyCumulativeAfterThisRefundPaise: excessiveAmountPaise,
              },
            });

            const response = await request(app)
              .post("/execute")
              .send(denialTransaction);

            // A policy denial is a deliberate, correct rejection — 403,
            // distinct from a genuine server error (500) or a replayed
            // authorization (409, the same-transaction-id repeat above).
            expect(response.status).toBe(403);
            expect(response.body.error).toContain("rejected");
            expect(response.body.code).toBe("POLICY_DENIED");

            // Policy rejection happens in ExecutionGate.enforce, before
            // ExecutionComponent ever dispatches to the connector — zero
            // Razorpay calls for the denial itself.
            const razorpayCalls = observed.filter((entry) =>
              entry.url.includes("api.razorpay.com"),
            );
            expect(razorpayCalls).toHaveLength(0);
          },
          30_000,
        );
      },
    );
  },
);
