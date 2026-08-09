import { InMemoryGatewaySessionStore, MemoryExecutionAuditSink } from "@parmana/execution-control";

//
// Tutorials 57-59 show the credential-isolation and secure-connector
// session mechanics generically, with one hand-built "sap" connector.
// This tutorial shows the layer above that: GatewayConnectorRegistry,
// the real production registry every capability (razorpay:refund-create,
// hubspot:deal-update, payments:execute) actually resolves through --
// the exact class createConnectorRegistry.ts wires up, exercised the
// same way its own unit test suite does.
//
process.env.NODE_ENV = "test";

const { createConnectorRegistry } = await import(
  "../../../packages/api/src/bootstrap/createConnectorRegistry.js"
);
const { createConnectorAuthenticator } = await import(
  "../../../packages/api/src/bootstrap/createConnectorAuthenticator.js"
);

function buildRegistry() {
  const authenticator = createConnectorAuthenticator();
  const sessions = new InMemoryGatewaySessionStore(Object.freeze({}));
  const audit = new MemoryExecutionAuditSink();
  return createConnectorRegistry(authenticator, sessions, audit, Object.freeze({ token: "test" }));
}

console.log();
console.log("==================================================");
console.log("Tutorial 81 - Connector Execution Gateway");
console.log("==================================================");
console.log();

console.log("Scenario 1: NODE_ENV=test -- every connector's capabilities resolve");
console.log("--------------------------------------------------");

const registry1 = buildRegistry();
console.log(`razorpay:refund-create -> connector "${registry1.resolveCapability("razorpay:refund-create").connectorId}"`);
console.log(`razorpay:payment-fetch -> connector "${registry1.resolveCapability("razorpay:payment-fetch").connectorId}"`);
console.log(`payments:execute       -> connector "${registry1.resolveCapability("payments:execute").connectorId}"`);
console.log();

console.log("Scenario 2: Outside test mode, with no Razorpay credentials configured -- fails closed, per capability");
console.log("--------------------------------------------------");

const previousNodeEnv = process.env.NODE_ENV;
const previousKeyId = process.env.RAZORPAY_KEY_ID;
const previousKeySecret = process.env.RAZORPAY_KEY_SECRET;

process.env.NODE_ENV = "production";
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;

const registry2 = buildRegistry();

let razorpayError: string | undefined;
try {
  registry2.resolveCapability("razorpay:refund-create");
} catch (error) {
  razorpayError = error instanceof Error ? error.message : String(error);
}
console.log(`razorpay:refund-create -> throws: ${razorpayError}`);

// vendor-payment (a NODE_ENV=test-only MockConnector, per Phase 2A) is
// ALSO absent outside test mode -- one missing connector's credentials
// never take the whole registry down, but every connector still fails
// closed independently on its own terms.
let vendorPaymentError: string | undefined;
try {
  registry2.resolveCapability("payments:execute");
} catch (error) {
  vendorPaymentError = error instanceof Error ? error.message : String(error);
}
console.log(`payments:execute       -> throws: ${vendorPaymentError}`);
console.log();

process.env.NODE_ENV = previousNodeEnv;
if (previousKeyId !== undefined) process.env.RAZORPAY_KEY_ID = previousKeyId;
if (previousKeySecret !== undefined) process.env.RAZORPAY_KEY_SECRET = previousKeySecret;

console.log("Scenario 3: Outside test mode, WITH real-looking Razorpay credentials configured");
console.log("--------------------------------------------------");

process.env.NODE_ENV = "production";
process.env.RAZORPAY_KEY_ID = "rzp_live_tutorial_id";
process.env.RAZORPAY_KEY_SECRET = "rzp_live_tutorial_secret";

const registry3 = buildRegistry();
console.log(`razorpay:refund-create -> connector "${registry3.resolveCapability("razorpay:refund-create").connectorId}"`);

delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;
process.env.NODE_ENV = previousNodeEnv;
console.log();

const allPassed =
  registry1.resolveCapability("razorpay:refund-create").connectorId === "razorpay" &&
  registry1.resolveCapability("payments:execute").connectorId === "vendor-payment" &&
  razorpayError?.includes("razorpay:refund-create") === true &&
  vendorPaymentError?.includes("payments:execute") === true &&
  registry3.resolveCapability("razorpay:refund-create").connectorId === "razorpay";

if (allPassed) {
  console.log(
    "✓ Capabilities resolve to their registered connector when credentials exist, and fail closed, per capability, when they don't.",
  );
} else {
  console.log("✗ Expected every capability resolution above to match the credential-configuration state.");
}

console.log();
console.log("Tutorial Complete");
console.log("Next: Tutorial 82 - Composite Signal-State Verification");
