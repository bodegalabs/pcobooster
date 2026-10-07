import { makeProductClient } from "@pcobooster/client/product-client";
import { createRequestScheduler } from "@pcobooster/client/request-scheduler";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { makeControlledFixture } from "../../harness/testing/controlled-fixture";
import { searchReads } from "./reads";

const setup = () => {
  const fixture = makeControlledFixture();
  const fetch = vi.fn<typeof globalThis.fetch>(fixture.fetch);
  const client = makeProductClient({
    url: "https://fixtures.invalid",
    client: "expo",
    credentials: "omit",
    fetch,
  });
  return {
    fixture,
    fetch,
    context: {
      client,
      scope: "account-a",
      scheduler: createRequestScheduler({ quietMs: 0 }),
    },
    cache: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  };
};
describe("Search typed reads", () => {
  it("encodes provider search and reuses Services catalog keys while separating accounts", async () => {
    const { cache, context, fetch } = setup();
    const types = await cache.query(searchReads.serviceTypes(context));
    const [type] = types;
    expect(type).toBeDefined();
    if (type === undefined) {
      throw new Error("Fixture needs a service type");
    }
    await cache.query(searchReads.plans(context, type.id));
    await cache.query(searchReads.people(context, "Grace"));
    await cache.query(searchReads.songs(context, "Grace"));
    const requests = fetch.mock.calls.map(
      ([input, init]) => new Request(input, init)
    );
    expect(
      requests.some(
        (request) => new URL(request.url).searchParams.get("query") === "Grace"
      )
    ).toBeTruthy();
    expect(searchReads.plans(context, type.id).queryKey).toStrictEqual([
      "account-a",
      "catalog.plans",
      type.id,
    ]);
    expect(
      searchReads.people({ ...context, scope: "account-b" }, "Grace").queryKey
    ).not.toStrictEqual(searchReads.people(context, "Grace").queryKey);
  });

  it("cancels an obsolete delayed search and prevents its result being stored", async () => {
    const { cache, context, fixture } = setup();
    const handle = vi.spyOn(fixture.transport, "handle");
    const pending =
      Promise.withResolvers<
        Awaited<ReturnType<typeof fixture.transport.handle>>
      >();
    handle.mockImplementationOnce(async () => await pending.promise);
    const options = searchReads.people(context, "Earlier");
    const old = (async () => {
      try {
        await cache.query(options);
      } catch {
        return "cancelled";
      }
      return "completed";
    })();
    await vi.waitFor(() => {
      expect(handle.mock.calls.length).toBeGreaterThan(0);
    });
    await cache.cancelQueries({ queryKey: options.queryKey, exact: true });
    await cache.query(searchReads.people(context, "Grace"));
    pending.resolve([]);
    await old;
    expect(cache.getQueryData(options.queryKey)).toBeUndefined();
    expect(
      cache.getQueryData(searchReads.people(context, "Grace").queryKey)
    ).toBeDefined();
  });
});
