/**
 * A Worker that shares a slow initialization across requests, then reads each request's own
 * body. `?share=cached` shares it with `Effect.cached`; `?share=across-requests` with
 * `cachedAcrossRequests`. Bundled into workerd by `shared-initialization.test.ts`.
 */
import { Effect } from "effect";

import {
  cachedAcrossRequests,
  cachedAcrossRequestsBy,
} from "./shared-initialization";

const initialize = Effect.sleep("200 millis").pipe(Effect.as("app"));
const shared = new Map<string, Effect.Effect<string>>();
interface FixtureBindings {
  readonly ROTATING_SECRET: { readonly get: () => Promise<string> };
}
let clock = 0;
let builds = 0;
let rotatingServer:
  | Effect.Effect<{ readonly credential: string; readonly generation: number }>
  | undefined;

const serverFor = (environment: FixtureBindings) => {
  rotatingServer ??= Effect.runSync(
    Effect.gen(function* setupRotation() {
      const read = yield* cachedAcrossRequests(
        Effect.promise(async () => await environment.ROTATING_SECRET.get()),
        { ttlMs: 100, now: () => clock }
      );
      return yield* cachedAcrossRequestsBy(
        read,
        (credential) =>
          Effect.sync(() => {
            builds += 1;
            return { credential, generation: builds };
          }).pipe(Effect.delay("20 millis")),
        (left, right) => left === right
      );
    })
  );
  return rotatingServer;
};

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
  fetch: async (
    request: Request,
    environment: FixtureBindings
  ): Promise<Response> =>
    await Effect.runPromise(
      Effect.gen(function* handle() {
        const url = new URL(request.url);
        if (url.pathname === "/rotation") {
          clock = Number(url.searchParams.get("clock") ?? "0");
          const server = yield* serverFor(environment);
          const body = yield* Effect.promise(async () => await request.text());
          return Response.json({ ...server, body });
        }
        yield* shareFor(new URL(request.url).searchParams.get("share") ?? "");
        const body = yield* Effect.promise(async () => await request.text());
        return new Response(body);
      })
    ),
};
