import { startDemoSession } from "@pcobooster/api/application/demo";
import {
  demoSessionCookie,
  setResponseCookie,
} from "@pcobooster/api/rpc/response-cookies";
import { demoRpc } from "@pcobooster/contracts/rpc/demo";
import { Effect } from "effect";

export const DemoHandlers = demoRpc.toLayer({
  "demo.start": (input) =>
    Effect.gen(function* startDemo() {
      const { sessionToken } = yield* startDemoSession(input);
      yield* setResponseCookie((secure) =>
        demoSessionCookie(sessionToken, secure)
      );
      return { demo: true };
    }),
  "demo.exit": () =>
    Effect.as(
      setResponseCookie((secure) => demoSessionCookie(null, secure)),
      { demo: false }
    ),
});
