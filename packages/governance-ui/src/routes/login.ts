import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import "../session.js";
import { fetchCallerIdentity, ApiClientError, ApiUnreachableError } from "../apiClient.js";
import { renderLoginPage } from "../views/login.js";

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function createLoginRouter(apiBaseUrl: string): Router {
  const router = Router();

  router.get("/login", (req: Request, res: Response): void => {
    if (req.session.apiKey !== undefined) {
      res.redirect("/");
      return;
    }

    res.send(renderLoginPage());
  });

  router.post(
    "/login",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const apiKey =
        typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";

      if (apiKey === "") {
        res.status(400).send(renderLoginPage("API key is required."));
        return;
      }

      try {
        const identity = await fetchCallerIdentity(apiBaseUrl, apiKey);

        // Regenerate the session id on login (not merely reuse an
        // anonymous pre-login session) -- standard session-fixation
        // hardening, cheap to do here regardless of how small this
        // tool's user base is.
        await regenerateSession(req);

        req.session.apiKey = apiKey;
        req.session.callerId = identity.callerId;

        res.redirect("/");
      } catch (error) {
        if (error instanceof ApiClientError) {
          const message =
            error.status === 401
              ? "Invalid API key."
              : `The Parmana API rejected this key: ${error.message}`;

          res.status(401).send(renderLoginPage(message));
          return;
        }

        if (error instanceof ApiUnreachableError) {
          res.status(502).send(renderLoginPage(error.message));
          return;
        }

        next(error);
      }
    },
  );

  router.post("/logout", (req: Request, res: Response): void => {
    req.session.destroy(() => {
      res.redirect("/login");
    });
  });

  return router;
}
