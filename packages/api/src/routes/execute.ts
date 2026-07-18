import { Router } from "express";
import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { BusinessTransactionMapper } from "../mappers/BusinessTransactionMapper.js";
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

        const transaction =
          BusinessTransactionMapper.fromRequest(
            req.body,
          );

console.log("[ROUTE] before execute");

const result =
  await application.execute(
    transaction,
  );

console.log("[ROUTE] after execute");

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