import { readFileSync } from "node:fs";
import path from "node:path";

import { AuthorizationSigner } from "@parmana/crypto";
import type { ExecutionRequest } from "@parmana/execution-system";
import type { Policy } from "@parmana/policy";
import type { ExecutableContent } from "@parmana/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  HUBSPOT_DEAL_UPDATE_CAPABILITY,
  MockHubSpotServer,
  buildHubSpotDealUpdateHarness,
  type HubSpotDeal,
  type HubSpotDealUpdateHarness,
} from "../../src/index.js";

const TOKEN = "HUBSPOT_TEST_TOKEN";

const policy = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, "../../../../policies/hubspot-deal-update/1.0.0/policy.json"),
    "utf8",
  ),
) as Policy;

function seededDeal(overrides: Partial<HubSpotDeal["properties"]> = {}): HubSpotDeal {
  return {
    id: "1001",
    properties: {
      dealstage: "appointmentscheduled",
      amount: "5000",
      pipeline: "default",
      ...overrides,
    },
  };
}

let server: MockHubSpotServer;
let harness: HubSpotDealUpdateHarness;

beforeEach(async () => {
  server = new MockHubSpotServer({ token: TOKEN });
  await server.listen();
  harness = buildHubSpotDealUpdateHarness({ baseUrl: server.baseUrl, privateAppToken: TOKEN, policy });
});

afterEach(async () => {
  await server.close();
});

/**
 * Full authorize -> verify -> execute -> confirm chain, hermetic against
 * MockHubSpotServer: HubSpotDealUpdateService signs an authorization,
 * ExecutionGateway verifies the envelope (signature, expiry, TTL,
 * nonce, businessTransactionHash), the session-credential-isolated
 * connector executes the PATCH, and a signed receipt (the "confirm"
 * step) is produced.
 */
describe("HubSpotDealUpdateService / harness (full chain, hermetic)", () => {
  it("authorizes and executes a dealstage-only update when every policy rule passes", async () => {
    server.setDeal(seededDeal());

    const outcome = await harness.service.requestDealUpdate({
      businessTransactionId: "txn-approve-stage",
      dealId: "1001",
      proposedDealStage: "qualifiedtobuy",
    });

    expect(outcome.replayed).toBe(false);
    expect(outcome.receipt.approved).toBe(true);
    expect(outcome.receipt.appliedDealStage).toBe("qualifiedtobuy");
    expect(outcome.receipt.policyDecision.outcome).toBe("APPROVE");
    expect(outcome.receipt.policyDecision.matchedRuleId).toBe("approve-deal-update");
    expect(server.getDeal("1001")?.properties.dealstage).toBe("qualifiedtobuy");
  });

  it("authorizes and executes a combined dealstage + amount update in the same action", async () => {
    server.setDeal(seededDeal());

    const outcome = await harness.service.requestDealUpdate({
      businessTransactionId: "txn-approve-combined",
      dealId: "1001",
      proposedDealStage: "qualifiedtobuy",
      proposedAmount: 5500,
    });

    expect(outcome.receipt.approved).toBe(true);
    expect(outcome.receipt.appliedDealStage).toBe("qualifiedtobuy");
    expect(outcome.receipt.appliedAmount).toBe("5500");
    expect(server.getDeal("1001")?.properties.amount).toBe("5500");
  });

  it("authorizes an amount change above the threshold when declared pre-authorized", async () => {
    server.setDeal(seededDeal());

    const outcome = await harness.service.requestDealUpdate({
      businessTransactionId: "txn-approve-preauth",
      dealId: "1001",
      proposedAmount: 50_000,
      preAuthorizedForAmountChange: true,
    });

    expect(outcome.receipt.approved).toBe(true);
    expect(outcome.receipt.appliedAmount).toBe("50000");
  });

  it("denies a dealstage transition out of a terminal stage (not on an allowed forward path), and makes zero HubSpot update calls", async () => {
    // closedlost is terminal: no transition out of it is ever allowed,
    // forward-looking stage order or not.
    server.setDeal(seededDeal({ dealstage: "closedlost" }));

    const outcome = await harness.service.requestDealUpdate({
      businessTransactionId: "txn-deny-from-terminal",
      dealId: "1001",
      proposedDealStage: "qualifiedtobuy",
    });

    expect(outcome.receipt.approved).toBe(false);
    expect(outcome.receipt.policyDecision.matchedRuleId).toBe("reject-stage-transition-not-allowed");
    // The deal's stage on HubSpot's side is exactly as it was before this
    // call: no PATCH call ever landed for the denied update.
    expect(server.getDeal("1001")?.properties.dealstage).toBe("closedlost");
  });

  it("denies a backward dealstage transition, and makes zero HubSpot update calls", async () => {
    server.setDeal(seededDeal({ dealstage: "presentationscheduled" }));

    const outcome = await harness.service.requestDealUpdate({
      businessTransactionId: "txn-deny-backward",
      dealId: "1001",
      // Backward: presentationscheduled -> appointmentscheduled.
      proposedDealStage: "appointmentscheduled",
    });

    expect(outcome.receipt.approved).toBe(false);
    expect(outcome.receipt.policyDecision.matchedRuleId).toBe("reject-stage-transition-not-allowed");
    expect(server.getDeal("1001")?.properties.dealstage).toBe("presentationscheduled");
  });

  it("denies an amount change exceeding the threshold without pre-authorization, and makes zero HubSpot update calls", async () => {
    server.setDeal(seededDeal({ amount: "5000" }));

    const outcome = await harness.service.requestDealUpdate({
      businessTransactionId: "txn-deny-amount",
      dealId: "1001",
      // Comfortably above HUBSPOT_DEFAULT_AMOUNT_CHANGE_THRESHOLD (10000).
      proposedAmount: 5000 + 20_000,
    });

    expect(outcome.receipt.approved).toBe(false);
    expect(outcome.receipt.policyDecision.matchedRuleId).toBe("reject-amount-exceeds-threshold-without-preauth");
    expect(server.getDeal("1001")?.properties.amount).toBe("5000");
  });

  it("replays the recorded outcome for a repeated transaction id and never contacts HubSpot a second time", async () => {
    server.setDeal(seededDeal());

    const input = {
      businessTransactionId: "txn-replay-1",
      dealId: "1001",
      proposedDealStage: "qualifiedtobuy",
    };

    const first = await harness.service.requestDealUpdate(input);
    expect(first.replayed).toBe(false);
    expect(server.getDeal("1001")?.properties.dealstage).toBe("qualifiedtobuy");

    // Move the deal again directly on the mock server to prove the
    // second call is answered from cache, not re-executed.
    server.setDeal(seededDeal({ dealstage: "presentationscheduled" }));

    const second = await harness.service.requestDealUpdate(input);

    expect(second.replayed).toBe(true);
    expect(second.receipt).toEqual(first.receipt);
    // Untouched by the replay: still whatever it was set to directly above.
    expect(server.getDeal("1001")?.properties.dealstage).toBe("presentationscheduled");
  });

  it("never places the token in the receipt, and includes only a redacted form", async () => {
    server.setDeal(seededDeal());

    const outcome = await harness.service.requestDealUpdate({
      businessTransactionId: "txn-credential-isolation",
      dealId: "1001",
      proposedDealStage: "qualifiedtobuy",
    });

    const serialized = JSON.stringify(outcome);
    expect(serialized).not.toContain(TOKEN);
    expect(outcome.receipt.bearerRedacted).toBe("pat-na1-9999...");
  });

  it("rejects a tampered request: a modified parameter after signing fails the businessTransactionHash check and is never executed", async () => {
    server.setDeal(seededDeal());

    const executableContent: ExecutableContent = Object.freeze({
      businessTransactionId: "txn-tamper-1",
      action: HUBSPOT_DEAL_UPDATE_CAPABILITY,
      target: "deals/1001",
      parameters: Object.freeze({ dealId: "1001", dealstage: "qualifiedtobuy" }),
    });

    const authorization = await new AuthorizationSigner(harness.crypto).sign(
      {
        decisionId: "decision-tamper-1",
        businessTransactionId: executableContent.businessTransactionId,
        policyName: harness.policy.policyId,
        policyVersion: harness.policy.policyVersion,
        executableContent,
      },
      harness.signerPrivateKey,
      harness.signerKeyId,
      60,
    );

    const tamperedRequest: ExecutionRequest = {
      businessTransactionId: executableContent.businessTransactionId,
      action: executableContent.action,
      target: executableContent.target,
      // Tampered after signing: stage changed from qualifiedtobuy to closedwon.
      parameters: { ...executableContent.parameters, dealstage: "closedwon" },
      authorization,
    };

    await expect(harness.gateway.execute(tamperedRequest)).rejects.toThrow(/businessTransactionHashMatches/);
    expect(server.getDeal("1001")?.properties.dealstage).toBe("appointmentscheduled");
  });
});
