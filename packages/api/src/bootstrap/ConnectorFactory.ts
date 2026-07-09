import type {
  SecureConnector,
} from "@parmana/execution-control";

import type {
  ExecutionControlComposition,
} from "./ExecutionControlComposition.js";

/**
 * Creates production SecureConnector instances.
 *
 * This is the single place responsible for
 * constructing enterprise connectors.
 *
 * Future connectors:
 *
 *  - Vendor Payment
 *  - Stripe
 *  - Salesforce
 *  - SAP
 *  - ServiceNow
 *  - Slack
 *  - Jira
 *  - GitHub
 */
export class ConnectorFactory {
  constructor(
    private readonly composition: ExecutionControlComposition,
  ) {}

  /**
   * Creates every connector configured for this deployment.
   */
  createAll(): SecureConnector[] {
    return [];
  }
}