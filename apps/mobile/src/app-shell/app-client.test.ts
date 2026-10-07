import {
  makeProductClient,
  TransportFailure,
} from "@pcobooster/client/product-client";
import { createRequestScheduler } from "@pcobooster/client/request-scheduler";
import { Unauthenticated } from "@pcobooster/contracts/faults/unauthenticated";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { callFailureOf } from "../diagnostics/call-failures";
import { makeFixtureFetch } from "../harness/fixture-transport";
import { credentialHeaders, noCredentials } from "../session/session-store";
import type { RequestCredentials } from "../session/session-store";
import { makeAppClient } from "./app-client";
import {
  deserializeQueryCache,
  isQueryCacheKeyFor,
  queryCacheKey,
  serializeQueryCache,
} from "./query-persistence";

const signedIn: RequestCredentials = {
  bearerToken: "tok.sig",
  accountId: "acct_1",
  demoToken: null,
};

describe("the product client's requests", () => {
  it("carry the bearer token, account, and client headers, never cookies", async () => {
    const seen: {
      headers: Headers;
      credentials: Request["credentials"];
    }[] = [];
    let credentials = signedIn;
    const fixtures = makeFixtureFetch({ latencyMs: 0 });
    const client = makeProductClient({
      url: "https://api.test",
      client: "expo",
      credentials: "omit",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        seen.push({
          headers: request.headers,
          credentials: request.credentials,
        });
        return await fixtures(input, init);
      },
      httpHeaders: () => credentialHeaders(credentials),
    });
    await client.run((api) => api.session.status());
    credentials = { ...noCredentials, demoToken: "demo" };
    await client.run((api) => api.session.status());

    const [first, second] = seen;
    expect([
      first?.headers.get("authorization"),
      first?.headers.get("x-pcobooster-account"),
      first?.headers.get("x-pcobooster-client"),
    ]).toStrictEqual(["Bearer tok.sig", "acct_1", "expo;api=1"]);
    expect(first?.headers.get("cookie")).toBeNull();
    expect([first?.credentials, second?.credentials]).toStrictEqual([
      "omit",
      "omit",
    ]);
    // The getter is read per request, so a session change applies to the next call.
    expect(second?.headers.get("authorization")).toBeNull();
    expect(second?.headers.get("x-pcobooster-demo")).toBe("demo");
  });
});

describe(makeAppClient, () => {
  it("reports an Unauthenticated answer with the credentials the call started with", async () => {
    const reported: RequestCredentials[] = [];
    let current = signedIn;
    const seen: Headers[] = [];
    const failing = makeProductClient({
      url: "https://api.test",
      client: "expo",
      credentials: "omit",
      httpHeaders: () => credentialHeaders(current),
      fetch: async (input, init) => {
        seen.push(new Request(input, init).headers);
        current = { ...signedIn, bearerToken: "other" };
        return await Promise.resolve(
          Response.json(
            { _tag: "Unauthenticated", message: "Sign in again." },
            { status: 401 }
          )
        );
      },
    });
    const client = makeAppClient(
      failing,
      {
        credentials: () => current,
        handleUnauthorized: (sent) => {
          reported.push(sent);
        },
        scope: () => "user:u1",
      },
      createRequestScheduler({ quietMs: 0 })
    );
    await expect(
      client.run((api) => api.session.status())
    ).rejects.toBeInstanceOf(Unauthenticated);
    expect(reported).toStrictEqual([signedIn]);
    expect(seen.map((headers) => headers.get("authorization"))).toStrictEqual([
      "Bearer tok.sig",
    ]);
  });
});

describe("cached reads on disk", () => {
  it("round-trip through each procedure's schema, dates included", async () => {
    const queryClient = new QueryClient();
    const client = makeProductClient({
      url: "https://api.test",
      client: "expo",
      credentials: "omit",
      fetch: makeFixtureFetch({ latencyMs: 0 }),
    });
    const plans = await client.run((api) =>
      api.catalog.plans({ params: { serviceTypeId: "1102" } })
    );
    queryClient.setQueryData(["user:u1:a1", "catalog.plans", "1102"], plans);
    queryClient.setQueryData(["user:u1:a1", "local.preference"], { a: 1 });

    const text = serializeQueryCache({
      timestamp: 1,
      buster: "b",
      clientState: dehydrate(queryClient),
    });
    const restored = deserializeQueryCache(text);
    expect(restored.clientState.queries).toHaveLength(1);
    const [query] = restored.clientState.queries;
    expect(query?.state.data).toStrictEqual(plans);
  });

  it("drops reads that no longer decode, and refuses a foreign format", () => {
    const text = JSON.stringify({
      timestamp: 1,
      buster: "b",
      clientState: {
        mutations: [],
        queries: [
          {
            queryKey: ["s", "catalog.plans", "1"],
            queryHash: "h",
            state: { status: "success", data: [{ wrong: true }] },
          },
        ],
      },
    });
    expect(deserializeQueryCache(text).clientState.queries).toHaveLength(0);
    expect(() => deserializeQueryCache("[]")).toThrow(
      "The cached reads are not in this build's format"
    );
  });

  it("keys caches by origin and account context", () => {
    const key = queryCacheKey("https://pcobooster.com", "user:u1:acct_1");
    expect(isQueryCacheKeyFor(key, "u1")).toBeTruthy();
    expect(isQueryCacheKeyFor(key, "u")).toBeFalsy();
    expect(
      isQueryCacheKeyFor(queryCacheKey("https://pcobooster.com", "demo"), "u1")
    ).toBeFalsy();
  });
});

/** What a call rejected with. */
const settledFailure = async (call: Promise<unknown>) => {
  try {
    await call;
    return null;
  } catch (error) {
    return error;
  }
};

/** Numbered request IDs and a clock that advances 5 ms per read. */
const identity = () => {
  let ids = 0;
  let clock = 0;
  return {
    newRequestId: () => {
      ids += 1;
      return `req-${ids}`;
    },
    now: () => {
      clock += 5;
      return clock;
    },
  };
};

describe("the app client's request IDs", () => {
  it("sends a fresh ID per call and still tells the caller each procedure", async () => {
    const sent: (string | null)[] = [];
    const fixtures = makeFixtureFetch({ latencyMs: 0 });
    const product = makeProductClient({
      url: "https://api.test",
      client: "expo",
      credentials: "omit",
      fetch: async (input, init) => {
        sent.push(new Request(input, init).headers.get("x-request-id"));
        return await fixtures(input, init);
      },
    });
    const client = makeAppClient(
      product,
      {
        credentials: () => signedIn,
        handleUnauthorized: () => {},
        scope: () => "user:u1",
      },
      createRequestScheduler({ quietMs: 0 }),
      identity()
    );
    const named: string[] = [];
    await client.run((api) => api.session.status(), {
      onProcedure: (name) => {
        named.push(name);
      },
      httpHeaders: { "x-request-id": "caller-chosen" },
    });
    await client.run((api) => api.session.status());
    expect([sent, named]).toStrictEqual([
      ["req-1", "req-2"],
      ["session.status"],
    ]);
  });

  it("leaves the request ID, procedure, and duration with a failed call's rejection", async () => {
    const product = makeProductClient({
      url: "https://api.test",
      client: "expo",
      credentials: "omit",
      fetch: async () => {
        await Promise.resolve();
        throw new TypeError("Network request failed");
      },
    });
    const client = makeAppClient(
      product,
      {
        credentials: () => signedIn,
        handleUnauthorized: () => {},
        scope: () => "user:u1",
      },
      createRequestScheduler({ quietMs: 0 }),
      identity()
    );
    const failure = await settledFailure(
      client.run((api) => api.session.status())
    );
    expect([
      failure instanceof TransportFailure,
      callFailureOf(failure),
    ]).toStrictEqual([
      true,
      {
        requestId: "req-1",
        procedure: "session.status",
        durationMs: 5,
        origin: null,
      },
    ]);
  });

  it("keeps an aborted call aborted without sending it", async () => {
    let fetched = 0;
    const product = makeProductClient({
      url: "https://api.test",
      client: "expo",
      credentials: "omit",
      fetch: async () => {
        fetched += 1;
        return await Promise.resolve(new Response());
      },
    });
    const client = makeAppClient(
      product,
      {
        credentials: () => signedIn,
        handleUnauthorized: () => {},
        scope: () => "user:u1",
      },
      createRequestScheduler({ quietMs: 0 }),
      identity()
    );
    const controller = new AbortController();
    controller.abort();
    const failure = await settledFailure(
      client.run((api) => api.session.status(), { signal: controller.signal })
    );
    expect([
      failure instanceof DOMException && failure.name,
      fetched,
    ]).toStrictEqual(["AbortError", 0]);
  });
});
