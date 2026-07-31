import { AuthorizationSigner } from "@parmana/crypto";

import {
  HUBSPOT_DEAL_UPDATE_CAPABILITY,
  MockHubSpotServer,
  buildHubSpotDealUpdateHarness,
} from "@parmana/connector-hubspot";

import { FilePolicyRepository } from "@parmana/policy";

import type { ExecutionRequest } from "@parmana/execution-system";
import type { ExecutableContent } from "@parmana/shared";

const TOKEN = "pat-na1-demo0000-0000-0000-0000-000000000000";

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 63 - HubSpot Deal Update Connector");
  console.log("==================================================");
  console.log();

  //
  // Local mock HubSpot server. Fake test-mode credentials, never
  // real ones. All HubSpot interaction here is against this
  // in-memory server, never a live network call.
  //
  const server = new MockHubSpotServer({ token: TOKEN });
  await server.listen();

  const policy = await new FilePolicyRepository("policies").load("hubspot-deal-update", "1.0.0");

  const harness = buildHubSpotDealUpdateHarness({
    baseUrl: server.baseUrl,
    privateAppToken: TOKEN,
    policy,
  });

  try {
    //
    // Outcome 1 - Approved and Executed
    //
    console.log("Outcome 1 - Approved and Executed");
    console.log("--------------------------------------------------");

    server.setDeal({
      id: "DEMO001",
      properties: { dealstage: "appointmentscheduled", amount: "5000", pipeline: "default" },
    });

    const approved = await harness.service.requestDealUpdate({
      businessTransactionId: "txn-demo-approved",
      dealId: "DEMO001",
      proposedDealStage: "qualifiedtobuy",
      proposedAmount: 5500,
    });

    console.log(`Approved            : ${approved.receipt.approved}`);
    console.log(`Applied Deal Stage  : ${approved.receipt.appliedDealStage}`);
    console.log(`Applied Amount      : ${approved.receipt.appliedAmount}`);
    console.log(`Policy Reason       : ${approved.receipt.policyDecision.reason}`);
    console.log(`Token (redacted)    : ${approved.receipt.bearerRedacted}`);
    console.log();

    //
    // Outcome 2 - Denied by Policy
    //
    console.log("Outcome 2 - Denied by Policy");
    console.log("--------------------------------------------------");

    server.setDeal({
      id: "DEMO002",
      properties: { dealstage: "closedlost", amount: "3000", pipeline: "default" },
    });

    const denied = await harness.service.requestDealUpdate({
      businessTransactionId: "txn-demo-denied",
      dealId: "DEMO002",
      // closedlost is terminal: no transition out of it is ever allowed.
      proposedDealStage: "qualifiedtobuy",
    });

    console.log(`Approved      : ${denied.receipt.approved}`);
    console.log(`Matched Rule  : ${denied.receipt.policyDecision.matchedRuleId}`);
    console.log(`Reason        : ${denied.receipt.policyDecision.reason}`);
    console.log();

    //
    // Outcome 3 - Replay Returns Recorded Result
    //
    console.log("Outcome 3 - Replay Returns Recorded Result");
    console.log("--------------------------------------------------");

    const dealStageBeforeReplay = server.getDeal("DEMO001")?.properties.dealstage;

    const replayed = await harness.service.requestDealUpdate({
      businessTransactionId: "txn-demo-approved",
      dealId: "DEMO001",
      proposedDealStage: "qualifiedtobuy",
      proposedAmount: 5500,
    });

    console.log(`Replayed              : ${replayed.replayed}`);
    console.log(
      `Same Receipt Returned : ${JSON.stringify(replayed.receipt) === JSON.stringify(approved.receipt)}`,
    );
    console.log(
      `Deal Stage On HubSpot : ${server.getDeal("DEMO001")?.properties.dealstage} (unchanged from ${dealStageBeforeReplay})`,
    );
    console.log();

    //
    // Outcome 4 - Tamper Rejected
    //
    console.log("Outcome 4 - Tamper Rejected");
    console.log("--------------------------------------------------");

    const executableContent: ExecutableContent = Object.freeze({
      businessTransactionId: "txn-demo-tamper",
      action: HUBSPOT_DEAL_UPDATE_CAPABILITY,
      target: "deals/DEMO001",
      parameters: Object.freeze({ dealId: "DEMO001", dealstage: "qualifiedtobuy" }),
    });

    const authorization = await new AuthorizationSigner(harness.crypto).sign(
      {
        decisionId: "decision-demo-tamper",
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
      // Tampered after signing: dealstage raised from qualifiedtobuy to closedwon.
      parameters: { ...executableContent.parameters, dealstage: "closedwon" },
      authorization,
    };

    try {
      await harness.gateway.execute(tamperedRequest);
      console.log("Unexpected: tampered request was accepted.");
    } catch (error) {
      console.log(`Rejected      : true`);
      console.log(`Reason        : ${(error as Error).message}`);
    }
    console.log();

    console.log("==================================================");
    console.log("Tutorial completed successfully.");
    console.log("==================================================");
  } finally {
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
