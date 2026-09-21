import { auth } from "@worship-admin/api/auth";
import { logger } from "@worship-admin/api/logger";
import { appRouter } from "@worship-admin/api/orpc";

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
