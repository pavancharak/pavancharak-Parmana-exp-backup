import "dotenv/config";

import { createExecutionSystem } from "./bootstrap/createExecutionSystem.js";
import { createApplication } from "./application.js";
import { createCallerAuthenticator } from "./bootstrap/createCallerAuthenticator.js";
import { createApp } from "./app.js";

const executionSystem =
  createExecutionSystem();

const application =
  createApplication(
    executionSystem,
  );

const callerAuth =
  createCallerAuthenticator();

const app =
  createApp(
    application,
    callerAuth.disabled
      ? {}
      : { callerAuth },
  );

const PORT = 3000;

app.listen(PORT, () => {
  console.log(
    `API running on http://localhost:${PORT}`,
  );
});