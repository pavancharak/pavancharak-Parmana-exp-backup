import "dotenv/config";

import { createExecutionSystem } from "./bootstrap/createExecutionSystem.js";
import { createApplication } from "./application.js";
import { createApp } from "./app.js";

const executionSystem =
  createExecutionSystem();

const application =
  createApplication(
    executionSystem,
  );

const app =
  createApp(
    application,
  );

const PORT = 3000;

app.listen(PORT, () => {
  console.log(
    `API running on http://localhost:${PORT}`,
  );
});