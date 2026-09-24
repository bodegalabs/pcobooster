import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start";

/** Defining `src/start.ts` turns off Start's default server-function CSRF guard. */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

const privateResponseHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

/**
 * Headers go on the final response: `setResponseHeaders` skips error, not-found, and
 * redirect responses, which need them too. Start creates each of those responses, so
 * their headers are mutable.
 */
const withPrivateHeaders = <Result extends { response: Response }>(
  result: Result
): Result => {
  for (const [name, value] of Object.entries(privateResponseHeaders)) {
    result.response.headers.set(name, value);
  }
  return result;
};

/** Every admin response is private, session-dependent, and kept out of search indexes. */
const privateResponseMiddleware = createMiddleware().server(async ({ next }) =>
  withPrivateHeaders(await next())
);

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, privateResponseMiddleware],
}));
