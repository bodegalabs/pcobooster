import { assert } from "@effect/vitest";
/**
 * The API Worker as Alchemy runs it under `alchemy dev`: workerd, a migrated local D1, the KV
 * cache, the auth rate limit, and settings bound from `Config`. The unit tests build the Hono
 * app directly; this catches wiring they cannot, such as a binding that is not provided or a
 * migration that fails to apply. It runs in the `test` stage, so it never touches `local`'s
 * data or ports, and needs no secrets.
 */
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle";
import * as State from "alchemy/State";
import * as Test from "alchemy/Test/Vitest";
import { Effect, Layer } from "effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import Api from "./worker";

/** Settings the API reads in a local stage; fictional, since nothing here reaches Planning Center. */
const testSettings = {
  BETTER_AUTH_SECRET: "stack-test-secret-that-is-long-enough-000",
  PLANNING_CENTER_OAUTH_CLIENT_ID: "stack-test-client",
  PLANNING_CENTER_OAUTH_CLIENT_SECRET: "stack-test-client-secret",
  PCOBOOSTER_ADMIN_EMAILS: "admin@example.com",
};
Object.assign(process.env, testSettings);

const providers = Layer.mergeAll(Cloudflare.providers(), Drizzle.providers());

const ApiStack = Alchemy.Stack(
  "pcobooster-api-test",
  { providers, state: State.inMemoryState() },
  Effect.gen(function* apiOnly() {
    const api = yield* Api;
    return { url: api.url };
  })
);

const { test, beforeAll, deploy } = Test.make({
  providers,
  state: State.inMemoryState(),
  stage: "test",
  dev: true,
});

// State is in memory and the resources are local, so there is nothing to destroy: the harness
// stops workerd when the file finishes.
const stack = beforeAll(deploy(ApiStack), { timeout: 180_000 });

/** The local API Worker's URL; `alchemy dev` always serves one. */
const apiUrl = stack.pipe(
  Effect.flatMap(({ url }) =>
    url === undefined
      ? Effect.die(new Error("The API Worker has no local URL"))
      : Effect.succeed(url)
  )
);

const statusOf = (request: HttpClientRequest.HttpClientRequest) =>
  HttpClient.execute(request).pipe(Effect.map((response) => response.status));

const signOut = (url: string, clientIp: string) =>
  statusOf(
    HttpClientRequest.post(`${url}/api/auth/sign-out`).pipe(
      HttpClientRequest.setHeader("cf-connecting-ip", clientIp)
    )
  );

/** Statuses of `count` sign-outs in a row from one client, and how many were rate limited. */
const repeatedSignOuts = (url: string, clientIp: string, count: number) =>
  Effect.all(
    Array.from({ length: count }, () => signOut(url, clientIp)),
    { concurrency: 1 }
  ).pipe(
    Effect.map((statuses) => ({
      last: statuses.at(-1),
      rateLimited: statuses.filter((status) => status === 429).length,
    }))
  );

test(
  "serves health through oRPC with its bindings wired",
  Effect.gen(function* serveHealth() {
    const url = yield* apiUrl;
    const response = yield* Test.executeWhenReady(
      HttpClientRequest.post(`${url}/api/rpc/health`).pipe(
        HttpClientRequest.bodyJsonUnsafe({ json: {} })
      )
    );
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(yield* response.json, {
      json: { status: "ok", version: "development" },
    });
  })
);

test(
  "limits auth writes per client IP but never session reads",
  Effect.gen(function* limitAuthWrites() {
    const url = yield* apiUrl;
    // One more than the 30 a minute `worker.ts` allows.
    const statuses = yield* repeatedSignOuts(url, "192.0.2.10", 31);
    const sessionRead = yield* statusOf(
      HttpClientRequest.get(`${url}/api/auth/get-session`).pipe(
        HttpClientRequest.setHeader("cf-connecting-ip", "192.0.2.10")
      )
    );
    const otherClient = yield* signOut(url, "192.0.2.11");

    assert.strictEqual(statuses.rateLimited, 1);
    assert.strictEqual(statuses.last, 429);
    assert.strictEqual(sessionRead, 200);
    assert.notStrictEqual(otherClient, 429);
  })
);
