import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start";

import { isPostHogProxyPath, proxyPostHog } from "@/server/posthog-proxy";
import { requestGateMiddleware } from "@/server/request-gate-middleware";

/** Defining `src/start.ts` turns off Start's default server-function CSRF guard. */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

const postHogMiddleware = createMiddleware().server(
  async ({ request, next }) =>
    isPostHogProxyPath(new URL(request.url).pathname)
      ? await proxyPostHog(request)
      : await next()
);

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, postHogMiddleware, requestGateMiddleware],
}));
