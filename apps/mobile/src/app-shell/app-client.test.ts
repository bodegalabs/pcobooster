import { makeProductClient } from "@pcobooster/client/product-client";
import { createRequestScheduler } from "@pcobooster/client/request-scheduler";
import { Unauthenticated } from "@pcobooster/contracts/faults/unauthenticated";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

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
    ]).toStrictEqual(["Bearer tok.sig", "acct_1", "expo;api=2"]);
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
