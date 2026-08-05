import { Router } from "express";
import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { BusinessTransactionMapper } from "../mappers/BusinessTransactionMapper.js";
import { isPrincipalAllowed } from "../auth/isPrincipalAllowed.js";
import type {
  ExecutionTrustApplication,
} from "@parmana/runtime";

/**
 * Returns true when the value is a UUID.
 */
function isValidBusinessTransactionId(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

/**
 * Creates the Execute router.
 */
export function createExecuteRouter(
  application: ExecutionTrustApplication,
): Router {
  const router = Router();

  router.post(
    "/",
    async (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        const {
          businessTransactionId,
        } = req.body;

        if (
          !isValidBusinessTransactionId(
            businessTransactionId,
          )
        ) {
          res.status(400).json({
            error:
              "businessTransactionId must be a valid UUID.",
          });
          return;
        }

        let transaction =
          BusinessTransactionMapper.fromRequest(
            req.body,
          );

        //
        // Caller identity binding: an authenticated caller may only
        // submit a transaction under an authority.principalId it is
        // actually permitted to assert (see isPrincipalAllowed.ts).
        // Skipped only when caller-auth itself is disabled (no
        // req.callerId at all), matching that mode's existing
        // no-caller-identity posture.
        //
        if (req.callerId !== undefined) {
          const principalId = transaction.authority?.principalId;

          if (
            !isPrincipalAllowed(
              principalId,
              req.callerId,
              req.callerAllowedPrincipalIds,
            )
          ) {
            res.status(403).json({
              error:
                "Caller is not permitted to assert this authority.principalId.",
            });
            return;
          }
        }

        //
        // metadata.submittedBy is server-set from the authenticated
        // caller, never trusted from the client (any client-supplied
        // value is overwritten here) — this is what
        // isOwnedByCaller.ts scopes /trust-records, /verify,
        // /verification, /replay, and /receipt* by.
        //
        if (req.callerId !== undefined) {
          transaction = {
            ...transaction,
            metadata: {
              ...transaction.metadata,
              submittedBy: req.callerId,
            },
          };
        }

        const result =
          await application.execute(
            transaction,
          );

        res.json(result);
        return;
      } catch (error) {
        next(error);
        return;
      }
    },
  );

  return router;
}