/**
 * @parmana/connector-hubspot
 *
 * HubSpot Deal connector for Parmana: dealstage and amount updates on
 * CRM Objects API Deals only (this milestone's scope — see
 * docs/CLAIMS.md). Depends on @parmana/connector-sdk's Connector
 * authoring contract rather than execution-control directly, the same
 * pattern the Razorpay connector (packages/connector-sdk/src/connectors/
 * razorpay) follows.
 */

export {
  HubSpotConnector,
  HUBSPOT_DEAL_FETCH_CAPABILITY,
  HUBSPOT_DEAL_UPDATE_CAPABILITY,
  type HubSpotConnectorOptions,
  type HubSpotDealFetchParameters,
  type HubSpotDealUpdateParameters,
} from "./HubSpotConnector.js";

export { HubSpotMetadata } from "./HubSpotMetadata.js";

export { MockHubSpotServer, type MockHubSpotServerOptions } from "./MockHubSpotServer.js";

export {
  HUBSPOT_ALLOWED_DEAL_UPDATE_PROPERTIES,
  HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN,
  isHubSpotCredentialValue,
  redactHubSpotToken,
  type HubSpotAllowedDealUpdateProperty,
  type HubSpotCredentialValue,
  type HubSpotDeal,
  type HubSpotDealProperties,
} from "./HubSpotTypes.js";

export {
  HUBSPOT_DEFAULT_STAGE_ORDER,
  HUBSPOT_LOST_STAGE,
  HUBSPOT_DEFAULT_AMOUNT_CHANGE_THRESHOLD,
  isHubSpotStageTransitionAllowed,
  buildHubSpotDealUpdateSignals,
  type BuildHubSpotDealUpdateSignalsInput,
} from "./HubSpotDealUpdateSignals.js";

export {
  buildHubSpotDealUpdateReceipt,
  type BuildHubSpotDealUpdateReceiptOptions,
  type HubSpotDealUpdateReceipt,
} from "./HubSpotDealUpdateReceipt.js";

export {
  executeHubSpotCapability,
  hubSpotConnectorResponseMetadata,
  type HubSpotCapabilityExecutionContent,
  type HubSpotCapabilityExecutionOptions,
} from "./HubSpotCapabilityExecution.js";

export {
  HubSpotSignalStateVerifier,
  type HubSpotSignalStateVerifierOptions,
} from "./HubSpotSignalStateVerifier.js";
