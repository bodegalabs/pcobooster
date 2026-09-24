import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

import { requestGateMiddleware } from "@/server/request-gate-middleware";

/** Defining `src/start.ts` turns off Start's default server-function CSRF guard. */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, requestGateMiddleware],
}));
