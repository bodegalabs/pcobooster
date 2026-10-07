import { setTimeout as nextTask } from "node:timers/promises";

import { makeProductClient } from "@pcobooster/client/product-client";
import {
  callForQuery,
  retryTransientReadFailure,
} from "@pcobooster/client/query";
import { createRequestScheduler } from "@pcobooster/client/request-scheduler";
import { describe, expect, it } from "vitest";

import { makeApiFailureReporter } from "../diagnostics/api-diagnostics";
import type { SessionContext } from "../diagnostics/capture-policy";
import { makeDiagnostics } from "../diagnostics/diagnostics-client";
import type { CapturedEvent } from "../diagnostics/diagnostics-client";
import { syntheticBadGateway } from "../diagnostics/synthetic-answers";
import { makeFixtureFetch } from "../harness/fixture-transport";
import { noCredentials } from "../session/session-store";
import type { RequestCredentials } from "../session/session-store";
import { makeAppClient } from "./app-client";
import { makeScopedQueryClient } from "./scoped-query-client";

interface Account {
  readonly scope: string;
  readonly credentials: RequestCredentials;
  readonly diagnostics: SessionContext;
}

const accountA: Account = {
  scope: "user:A:acct-a:id-a",
  credentials: { bearerToken: "token-a", accountId: "acct-a", demoToken: null },
  diagnostics: { kind: "signed-in", userId: "A" },
};
const accountB: Account = {
  scope: "user:B:acct-b:id-b",
  credentials: { bearerToken: "token-b", accountId: "acct-b", demoToken: null },
  diagnostics: { kind: "signed-in", userId: "B" },
};
const signedOut: Account = {
  scope: "signedOut",
  credentials: noCredentials,
  diagnostics: { kind: "signed-out" },
};
const demo: Account = {
  scope: "demo:id-d",
  credentials: { ...noCredentials, demoToken: "demo-token" },
  diagnostics: { kind: "demo" },
};

/**
 * The app's real reporting path: the session's scope and credentials, the app client, the
 * per-scope query cache, the API failure reporter, and diagnostics over a recording transport.
 * Each request waits until the test answers it with a 502.
 */
const appHarness = (start: Account) => {
  let account = start;
  const sent: CapturedEvent[] = [];
  const wire: { authorization: string | null; requestId: string | null }[] = [];
  const waiting: (() => void)[] = [];
  const fixtures = makeFixtureFetch({ latencyMs: 0 });
  const diagnostics = makeDiagnostics({
    enabled: true,
    release: {
      version: "0.1.0",
      build: "372",
      revision: "a".repeat(40),
      namespace: "com.pcobooster.ios",
      osName: "iOS",
      osVersion: "26.0",
    },
    pending: null,
    transport: async (events) => {
      sent.push(...events);
      return await Promise.resolve(true);
    },
  });
  diagnostics.setPreference("opted-in");
  diagnostics.setSession(account.diagnostics);
  let ids = 0;
  const product = makeProductClient({
    url: "https://api.test",
    client: "expo",
    credentials: "omit",
    fetch: async (input, init) => {
      const request = new Request(input, init);
      wire.push({
        authorization: request.headers.get("authorization"),
        requestId: request.headers.get("x-request-id"),
      });
      await fixtures(input, init);
      const answer = Promise.withResolvers<null>();
      waiting.push(() => {
        answer.resolve(null);
      });
      await answer.promise;
      return syntheticBadGateway();
    },
  });
  const clients = makeAppClient(
    product,
    {
      credentials: () => account.credentials,
      handleUnauthorized: () => {},
      scope: () => account.scope,
    },
    createRequestScheduler({ quietMs: 0 }),
    {
      newRequestId: () => {
        ids += 1;
        return `request-${ids}`;
      },
      now: () => 0,
      origin: diagnostics.origin,
    }
  );
  const reportApiFailure = makeApiFailureReporter(diagnostics);
  const cacheFor = (scope: string) =>
    makeScopedQueryClient(
      scope,
      { queries: { retry: retryTransientReadFailure, retryDelay: 0 } },
      {
        report: reportApiFailure,
        origin: diagnostics.origin,
        currentScope: () => account.scope,
        online: () => true,
      }
    );
  const cache = cacheFor(start.scope);
  const client = clients.forScope(start.scope);
  const answerAll = async () => {
    // Lets the client reach its fetch, then answers everything waiting.
    for (let round = 0; round < 20; round += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one macrotask per round
      await nextTask(0);
      for (const answer of waiting.splice(0)) {
        answer();
      }
    }
    await diagnostics.settled();
  };
  return {
    sent,
    wire,
    cache,
    client,
    diagnostics,
    switchTo: (next: Account) => {
      account = next;
      diagnostics.setSession(next.diagnostics);
    },
    answerAll,
    mutate: async () => {
      const mutation = cache.getMutationCache().build(cache, {
        mutationFn: async (_input: null) =>
          await client.run((api) => api.catalog.organization()),
      });
      try {
        await mutation.execute(null);
      } catch {
        /* The cache's onError is what these tests observe. */
      }
    },
    read: async () => {
      try {
        await cache.query({
          queryKey: [start.scope, "catalog.organization"],
          queryFn: async (context) =>
            await callForQuery(context, client, (api) =>
              api.catalog.organization()
            ),
        });
      } catch {
        /* As above. */
      }
    },
  };
};

const reported = (sent: readonly CapturedEvent[]) =>
  sent.map((event) => ({
    event: event.event,
    distinct_id: event.distinct_id,
    request_id: event.properties.request_id,
  }));

describe("API failures that settle after the context changed", () => {
  it("are reported for the account they started in when nothing changed", async () => {
    const app = appHarness(accountA);
    const mutation = app.mutate();
    await app.answerAll();
    await mutation;
    expect(reported(app.sent)).toStrictEqual([
      {
        event: "api request failed",
        distinct_id: "A",
        request_id: "request-1",
      },
    ]);
  });

  it.each([
    ["a switch to another account", [accountB]],
    ["a sign-out and a sign-in as someone else", [signedOut, accountB]],
    ["a sign-out", [signedOut]],
  ])(
    "are never reported as the new account's after %s",
    async (_name, steps) => {
      const app = appHarness(accountA);
      const mutation = app.mutate();
      await nextTask(0);
      for (const step of steps) {
        app.switchTo(step);
      }
      await app.answerAll();
      await mutation;
      expect(reported(app.sent)).toStrictEqual([]);
    }
  );

  it("are never reported when a demo's request settles after a real sign-in", async () => {
    const app = appHarness(demo);
    const mutation = app.mutate();
    await nextTask(0);
    app.switchTo(accountA);
    await app.answerAll();
    await mutation;
    expect(reported(app.sent)).toStrictEqual([]);
  });

  it("are never reported after an opt-out, even once the person opts back in", async () => {
    const app = appHarness(accountA);
    const mutation = app.mutate();
    await nextTask(0);
    app.diagnostics.setPreference("opted-out");
    app.diagnostics.setPreference("opted-in");
    await app.answerAll();
    await mutation;
    expect(reported(app.sent)).toStrictEqual([]);
  });

  it("do not send a retry with the new account's credentials, and report nothing", async () => {
    const app = appHarness(accountA);
    const read = app.read();
    await nextTask(0);
    app.switchTo(accountB);
    await app.answerAll();
    await read;
    expect([
      app.wire,
      app.cache.getQueryData([accountA.scope, "catalog.organization"]),
      reported(app.sent),
    ]).toStrictEqual([
      [{ authorization: "Bearer token-a", requestId: "request-1" }],
      undefined,
      [],
    ]);
  });
});
