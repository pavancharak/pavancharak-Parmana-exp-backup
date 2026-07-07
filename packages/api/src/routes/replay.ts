import { Router } from "express";
import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { application } from "../application.js";

const router = Router();

/**
 * POST /replay
 *
 * Replays an existing Execution Trust Record.
 */
router.post(
  "/",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { businessTransactionId } =
        req.body ?? {};

      //
      // Required field
      //
      if (!businessTransactionId) {
        res.status(400).json({
          error:
            "businessTransactionId is required.",
        });
        return;
      }

      const replay =
        await application.replay(
          businessTransactionId,
        );

      res.json(replay);
      return;
    } catch (error) {
      next(error);
      return;
    }
  },
);

export default router;