import {
  HubSpotConnector,
  HUBSPOT_DEAL_FETCH_CAPABILITY,
  HUBSPOT_DEAL_UPDATE_CAPABILITY,
} from "@parmana/connector-hubspot";
import { connectorCapabilities } from "@parmana/connector-sdk";

/**
 * Creates the HubSpot connector.
 *
 * baseUrl defaults to HubSpotConnector's own default (HubSpot's real
 * production API) unless HUBSPOT_BASE_URL is explicitly set. That
 * variable exists solely as a test seam so an integration test can point
 * this connector at a hermetic MockHubSpotServer instead — it is never
 * set in production, so production traffic reaches the real HubSpot API
 * unless an operator deliberately opts out. Mirrors
 * createRazorpayConnector.ts's RAZORPAY_BASE_URL seam exactly.
 */
export function createHubSpotConnector(): HubSpotConnector {
  return new HubSpotConnector({
    connectorId: "hubspot",

    capabilities: connectorCapabilities([HUBSPOT_DEAL_FETCH_CAPABILITY, HUBSPOT_DEAL_UPDATE_CAPABILITY]),

    ...(process.env.HUBSPOT_BASE_URL !== undefined ? { baseUrl: process.env.HUBSPOT_BASE_URL } : {}),
  });
}
