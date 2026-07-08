/**
 * Parmana SDK
 *
 * Verification API.
 */

import type {
  Verification,
} from "../models/index.js";

import type {
  Transport,
} from "../config/Transport.js";

export class VerificationApi {
  constructor(
    private readonly transport: Transport,
  ) {}

  /**
   * Returns the latest Verification for a
   * Business Transaction, without performing a
   * fresh verification. Maps to GET
   * /verification/:id.
   */
  public async getLatest(
    businessTransactionId: string,
  ): Promise<Verification> {
    const response =
      await this.transport.send<Verification>({
        path: `/verification/${businessTransactionId}`,
        method: "GET",
      });

    return response.body;
  }
}