import { Router } from "express";
import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { application } from "../application.js";

const router = Router();

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
      const transaction = {
        ...req.body,
        createdAt: new Date(
          req.body.createdAt,
        ),
      };

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

export default router;