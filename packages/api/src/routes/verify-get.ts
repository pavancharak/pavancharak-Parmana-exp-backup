import { Router } from "express";
import type {
  NextFunction,
  Request,
  Response,
} from "express";

import type { ExecutionTrustApplication } from "@parmana/runtime";

export function createVerifyGetRouter(
  application: ExecutionTrustApplication,
): Router {
  const router = Router();

/**
 * GET /verify/:id
 *
 * Returns the latest Verification.
 */
router.get(
  "/:id",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const record =
        await application.getTrustRecord(
          String(req.params.id),
        );

      if (!record) {
        res.status(404).json({
          error:
            "Execution Trust Record not found.",
        });
        return;
      }

      const verification =
        record.verifications.at(-1);

      if (!verification) {
        res.status(404).json({
          error:
            "Verification not found.",
        });
        return;
      }

      // Settlement status (M4b) is never silent: a verifier checking
      // this response for a settled/settlement-failed refund must see
      // that state alongside the verification result, not have to
      // separately know to fetch the whole Trust Record.
      const settlementConfirmation =
        record.settlementConfirmations?.at(-1);

      res.json({
        ...verification,
        ...(settlementConfirmation
          ? {
              settlement: {
                status: settlementConfirmation.status,
                confirmationId: settlementConfirmation.confirmationId,
                fetchedRefundStatus: settlementConfirmation.fetchedRefundStatus,
                razorpayRefundId: settlementConfirmation.razorpayRefundId,
                issuedAt: settlementConfirmation.issuedAt,
              },
            }
          : {}),
      });
      return;
    } catch (error) {
      next(error);
      return;
    }
  },
);

return router;
}