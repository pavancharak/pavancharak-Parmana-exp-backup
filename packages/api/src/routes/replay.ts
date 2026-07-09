import { Router } from "express";
import type {
  NextFunction,
  Request,
  Response,
} from "express";

import type { ExecutionTrustApplication } from "@parmana/runtime";

export function createReplayRouter(
  application: ExecutionTrustApplication,
): Router {
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

return router;
}