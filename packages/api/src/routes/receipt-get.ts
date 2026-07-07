import { Router } from "express";
import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { application } from "../application.js";

const router = Router();

/**
 * GET /receipt/:id
 *
 * Returns the latest Receipt.
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

      const receipt =
        record.receipts.at(-1);

      if (!receipt) {
        res.status(404).json({
          error: "Receipt not found.",
        });
        return;
      }

      res.json(receipt);
      return;
    } catch (error) {
      next(error);
      return;
    }
  },
);

export default router;