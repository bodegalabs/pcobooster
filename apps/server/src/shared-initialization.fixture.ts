/**
 * A Worker that shares a slow initialization across requests, then reads each request's own
 * body. `?share=cached` shares it with `Effect.cached`; `?share=across-requests` with
 * `cachedAcrossRequests`. Bundled into workerd by `shared-initialization.test.ts`.
 */
import { Effect } from "effect";

import { cachedAcrossRequests } from "./shared-initialization";

const initialize = Effect.sleep("200 millis").pipe(Effect.as("app"));
const shared = new Map<string, Effect.Effect<string>>();

const shareFor = (mode: string): Effect.Effect<string> => {
  const existing = shared.get(mode);
  if (existing !== undefined) {
    return existing;
  }
  // Created in a request: workerd forbids timers and I/O in the global scope.
  const created = Effect.runSync(
    mode === "cached"
      ? Effect.cached(initialize)
      : cachedAcrossRequests(initialize)
  );
  shared.set(mode, created);
  return created;
};

export default {
  fetch: async (request: Request): Promise<Response> =>
    await Effect.runPromise(
      Effect.gen(function* handle() {
        yield* shareFor(new URL(request.url).searchParams.get("share") ?? "");
        const body = yield* Effect.promise(async () => await request.text());
        return new Response(body);
      })
    ),
};
