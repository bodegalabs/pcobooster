import { startDemoSession } from "@pcobooster/api/application/demo";
import {
  demoSessionCookie,
  setResponseCookie,
} from "@pcobooster/api/http/response-cookies";
import { ProductApi } from "@pcobooster/contracts/http/api";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

export const DemoHandlers = HttpApiBuilder.group(
  ProductApi,
  "demo",
  (handlers) =>
    handlers
      .handle("start", ({ payload }) =>
        Effect.gen(function* startDemo() {
          const { sessionToken } = yield* startDemoSession(payload);
          yield* setResponseCookie((secure) =>
            demoSessionCookie(sessionToken, secure)
          );
          return { demo: true };
        })
      )
      .handle("exit", () =>
        Effect.as(
          setResponseCookie((secure) => demoSessionCookie(null, secure)),
          { demo: false }
        )
      )
);
