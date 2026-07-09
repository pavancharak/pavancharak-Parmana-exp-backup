import { Router } from "express";
import type {
  NextFunction,
  Request,
  Response,
} from "express";

import type { ExecutionTrustApplication } from "@parmana/runtime";
import { BusinessTransactionMapper } from "../mappers/BusinessTransactionMapper.js";

export function createTransactionsRouter(
  application: ExecutionTrustApplication,
): Router {
  const router = Router();

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
 * GET /transactions
 *
 * Lists accepted Business Transactions.
 */
router.get(
  "/",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const page = Number(
        req.query.page ?? 1,
      );

      const pageSize = Number(
        req.query.pageSize ?? 25,
      );

      const transactions =
        await application.listTransactions(
          page,
          pageSize,
        );

      res.json(transactions);
      return;
    } catch (error) {
      next(error);
      return;
    }
  },
);

/**
 * GET /transactions/:id
 *
 * Returns a Business Transaction.
 */
router.get(
  "/:id",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const transaction =
        await application.getTransaction(
          String(req.params.id),
        );

      if (!transaction) {
        res.status(404).json({
          error:
            "Business Transaction not found.",
        });
        return;
      }

      res.json(transaction);
      return;
    } catch (error) {
      next(error);
      return;
    }
  },
);

/**
 * POST /transactions
 *
 * Executes a Business Transaction through Runtime
 */
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

      const result =
        await application.execute(
          transaction,
        );

      res.status(201).json(result);
      return;
    } catch (error) {
      next(error);
      return;
    }
  },
);

return router;
}