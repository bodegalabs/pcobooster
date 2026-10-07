import { makeProductClient } from "@pcobooster/client/product-client";
import { createRequestScheduler } from "@pcobooster/client/request-scheduler";
import { Forbidden } from "@pcobooster/contracts/faults/forbidden";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  deserializeQueryCache,
  serializeQueryCache,
} from "../../app-shell/query-persistence";
import activityFixture from "../../harness/fixtures/people.dashboardActivity.json";
import personFixture from "../../harness/fixtures/people.dashboardPerson.json";
import { makeControlledFixture } from "../../harness/testing/controlled-fixture";
import { cachedDashboard, placeholderDetail } from "./person-detail";
import {
  cachedActivities,
  ContinuationStalledError,
  peopleKeys,
  peopleReads,
  prefetchPerson,
} from "./reads";

const setup = (scope = "user:1:org:a") => {
  const { transport, fetch: fixtureFetch } = makeControlledFixture();
  const fetch = vi.fn<typeof globalThis.fetch>(fixtureFetch);
  const client = makeProductClient({
    url: "https://fixtures.invalid",
    client: "expo",
    credentials: "omit",
    fetch,
  });
  const context = {
    client,
    scope,
    scheduler: createRequestScheduler({ quietMs: 0 }),
  };
  return {
    transport,
    fetch,
    context,
    cache: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  };
};

/** The requests the client sent, decoded for assertions. */
const sentRequests = async (
  fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>
) =>
  await Promise.all(
    fetch.mock.calls.map(async ([input, init]) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      return {
        path: url.pathname,
        query: url.searchParams,
        method: request.method,
        body: await request.text(),
        headers: request.headers,
        aborted: init?.signal?.aborted === true,
      };
    })
  );

const budget = {
  limit: 30,
  planningCenterRequests: 2,
  scheduleRequests: 1,
  planTimeRequests: 1,
};
const [firstActivity, secondActivity] = activityFixture.default.people;
const firstId = firstActivity?.id ?? "";
const secondId = secondActivity?.id ?? "";

describe("People reads on the wire", () => {
  it("reads the roster and an activity batch with every person id in the query", async () => {
    const { context, cache, fetch } = setup();
    const roster = await cache.query(peopleReads.roster(context));
    const ids = roster.people.slice(0, 3).map((person) => person.id);
    await cache.query(peopleReads.activity(context, ids));
    const [rosterCall, activityCall] = await sentRequests(fetch);
    expect(rosterCall?.path).toBe("/api/v1/people/roster");
    expect(activityCall?.path).toBe("/api/v1/people/activity");
    expect(activityCall?.query.getAll("personIds")).toStrictEqual(ids);
    expect(activityCall?.headers.get("x-pcobooster-client")).toMatch(
      /^expo;api=/u
    );
  });

  it("posts a person's month without a cursor and reads blockouts as dates", async () => {
    const { context, cache, fetch } = setup();
    await cache.query(peopleReads.person(context, "4100104", "2026-11"));
    const blockouts = await cache.query(
      peopleReads.blockouts(context, "4100104")
    );
    const [personCall, blockoutsCall] = await sentRequests(fetch);
    expect(personCall).toMatchObject({
      method: "POST",
      path: "/api/v1/people/4100104/dashboard",
    });
    expect(personCall?.body).toContain('"month":"2026-11"');
    expect(personCall?.body).not.toContain("plans");
    expect(blockoutsCall?.path).toBe("/api/v1/people/4100104/blockouts");
    expect(blockouts[0]?.startsAt).toBeInstanceOf(Date);
  });
});

describe("Partial answers", () => {
  it("asks again for only the deferred people and returns one complete batch", async () => {
    const { transport, context, cache } = setup();
    const call = vi.spyOn(transport, "handle");
    call.mockResolvedValueOnce({
      generatedAt: "g1",
      people: [firstActivity],
      deferredPersonIds: [secondId],
      requestBudget: budget,
    });
    call.mockResolvedValueOnce({
      generatedAt: "g2",
      people: [secondActivity],
      deferredPersonIds: [],
      requestBudget: budget,
    });
    const batch = await cache.query(
      peopleReads.activity(context, [firstId, secondId])
    );
    // One query value decodes as a string in the fixture transport.
    expect(call).toHaveBeenLastCalledWith("people.dashboardActivity", {
      personIds: secondId,
    });
    expect(batch).toMatchObject({
      people: [{ id: firstId }, { id: secondId }],
      deferredPersonIds: [],
      requestBudget: { planningCenterRequests: 4 },
    });
  });

  it("keeps the merged batch through the disk cache's schema round trip", async () => {
    const { context, cache } = setup();
    const ids = [firstId, secondId];
    await cache.query(peopleReads.activity(context, ids));
    const state = cache
      .getQueryCache()
      .find({ queryKey: peopleKeys.activity(context.scope, ids) })?.state;
    expect(state?.status).toBe("success");
    const restored = deserializeQueryCache(
      serializeQueryCache({
        timestamp: 0,
        buster: "",
        clientState: {
          mutations: [],
          queries:
            state === undefined
              ? []
              : [
                  {
                    queryKey: peopleKeys.activity(context.scope, ids),
                    queryHash: "activity",
                    dehydratedAt: 0,
                    state,
                  },
                ],
        },
      })
    );
    expect(restored.clientState.queries).toHaveLength(1);
  });

  it("fails typed instead of looping when a call defers everyone it was asked for", async () => {
    const { transport, context, cache } = setup();
    vi.spyOn(transport, "handle").mockResolvedValue({
      generatedAt: "g",
      people: [],
      deferredPersonIds: ["a"],
      requestBudget: budget,
    });
    await expect(
      cache.query(peopleReads.activity(context, ["a"]))
    ).rejects.toBeInstanceOf(ContinuationStalledError);
  });

  it("follows the person continuation and stops on one that does not move", async () => {
    const { transport, context, cache } = setup();
    const call = vi.spyOn(transport, "handle");
    const continuation = {
      plans: [{ planId: "p", nextOffset: 25 }],
      times: [],
    };
    call.mockResolvedValueOnce({ ...personFixture.default, continuation });
    call.mockResolvedValueOnce({
      ...personFixture.default,
      continuation: null,
    });
    await expect(
      cache.query(peopleReads.person(context, "4100104", null))
    ).resolves.toMatchObject({ continuation: null });
    expect(call).toHaveBeenLastCalledWith(
      "people.dashboardPerson",
      expect.objectContaining({ personId: "4100104", continuation })
    );
    call.mockResolvedValue({ ...personFixture.default, continuation });
    await expect(
      cache.query(peopleReads.person(context, "4100105", null))
    ).rejects.toBeInstanceOf(ContinuationStalledError);
  });
});

describe("Failures, cancellation, and accounts", () => {
  it("surfaces a permission fault typed", async () => {
    const { transport, context, cache, fetch } = setup();
    vi.spyOn(transport, "handle").mockRejectedValue(
      new Forbidden({ message: "You can't see People in this organization." })
    );
    await expect(
      cache.query(peopleReads.roster(context))
    ).rejects.toBeInstanceOf(Forbidden);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("reports offline as a network transport failure", async () => {
    const { context, cache } = setup();
    const offline = makeProductClient({
      url: "https://fixtures.invalid",
      client: "expo",
      credentials: "omit",
      fetch: vi
        .fn<typeof globalThis.fetch>()
        .mockRejectedValue(new TypeError("Network request failed")),
    });
    await expect(
      cache.query(peopleReads.roster({ ...context, client: offline }))
    ).rejects.toMatchObject({ _tag: "TransportFailure", reason: "network" });
  });

  it("aborts a cancelled read and keeps no stale answer", async () => {
    const { transport, context, cache, fetch } = setup();
    const release = Promise.withResolvers<null>();
    vi.spyOn(transport, "handle").mockImplementation(async () => {
      await release.promise;
      return personFixture.default;
    });
    const options = peopleReads.person(context, "4100104", null);
    const pending = cache.query(options);
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledOnce();
    });
    await cache.cancelQueries({ queryKey: options.queryKey });
    release.resolve(null);
    await expect(pending).rejects.toBeDefined();
    const [sent] = await sentRequests(fetch);
    expect(sent?.aborted).toBeTruthy();
    expect(cache.getQueryData(options.queryKey)).toBeUndefined();
  });

  it("keys reads by account so one account's people never paint another's", async () => {
    const { context, cache } = setup("user:1:org:a");
    const other = { ...context, scope: "user:2:org:b" };
    expect(peopleReads.person(other, "p", null).queryKey[0]).toBe(other.scope);
    const roster = await cache.query(peopleReads.roster(context));
    const ids = roster.people.slice(0, 2).map((person) => person.id);
    await cache.query(peopleReads.activity(context, ids));
    expect(cachedActivities(cache, other.scope)).toStrictEqual([]);
    expect(
      placeholderDetail(
        cachedDashboard(roster, cachedActivities(cache, context.scope)),
        ids[0] ?? "",
        null
      )?.person.id
    ).toBe(ids[0]);
  });

  it("prefetches a person in the speculative lane", async () => {
    const { context, cache, fetch } = setup();
    await prefetchPerson(context, cache, "4100104");
    const [sent] = await sentRequests(fetch);
    expect(sent?.headers.get("x-pcobooster-priority")).toBe("speculative");
  });
});
