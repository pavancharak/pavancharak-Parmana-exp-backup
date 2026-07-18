import { Router } from "express";
import type {
  NextFunction,
  Request,
  Response,
} from "express";

import type { ExecutionTrustApplication } from "@parmana/runtime";

export function createTrustRecordsRouter(
  application: ExecutionTrustApplication,
): Router {
  const router = Router();

  /**
   * GET /trust-records/:businessTransactionId
   *
   * Returns the Execution Trust Record for a Business Transaction.
   */
  router.get(
    "/:businessTransactionId",
    async (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        const record =
          await application.getTrustRecord(
            req.params.businessTransactionId,
          );

        if (!record) {
          res.status(404).json({
            error: "Execution Trust Record not found.",
          });
          return;
        }

        res.json(record);
        return;
      } catch (error) {
        next(error);
        return;
      }
    },
  );

  return router;
}