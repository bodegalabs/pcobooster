import { auth } from "@pcobooster/api/auth";
import { logger } from "@pcobooster/api/logger";
import { appRouter } from "@pcobooster/api/orpc";

import { createServerApp } from "./app";

const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3001";
const log = logger.for("server");

const app = createServerApp({
  authHandler: auth.handler,
  corsOrigin,
  log,
  router: appRouter,
});

export type App = typeof app;
export { createServerApp } from "./app";
export default app;
