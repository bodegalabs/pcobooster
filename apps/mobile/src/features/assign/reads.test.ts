import { makeProductClient } from "@pcobooster/client/product-client";
import { createRequestScheduler } from "@pcobooster/client/request-scheduler";
import {
  assembleCandidateList,
  collectCandidateDetails,
  expandWindowHistory,
} from "@pcobooster/planning-center-models/candidate-list";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import detailsFixture from "../../harness/fixtures/people.candidateDetails.json";
import windowFixture from "../../harness/fixtures/people.planWindowHistory.json";
import { makeControlledFixture } from "../../harness/testing/controlled-fixture";
import { planReads } from "../plan/reads";
import { assignReads, candidateReadState, warmCandidates } from "./reads";

const slot = {
  serviceTypeId: "1101",
  planId: "881261004",
  teamId: "2201",
  positionId: "3301",
  date: "2026-10-04T16:00:00.000Z",
};
const setup = () => {
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
    scope: "account-a",
    scheduler: createRequestScheduler({ quietMs: 0 }),
  };
  return {
    transport,
    fetch,
    client,
    context,
    cache: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  };
};

describe("Assign reads through the product client", () => {
  it("loads candidates, history and availability with the full ISO instant and org frequency rules", async () => {
    const { context, cache, fetch } = setup();
    const candidates = await cache.query(assignReads.candidates(context, slot));
    const history = await cache.query(assignReads.history(context, slot.date));
    const ids = candidates.candidates.map((person) => person.id);
    const details = await cache.query(
      assignReads.details(context, slot, ids, false)
    );
    const list = assembleCandidateList({
      candidates,
      windowHistory: expandWindowHistory(history, slot.planId),
      scheduleHistory: false,
      details: collectCandidateDetails([details]),
      date: slot.date,
    });
    expect(list.complete).toBeTruthy();
    expect(
      list.people.find((person) => person.id === "4100104")?.frequency
        ?.recentServedDays
    ).toBe(5);
    const requests = await Promise.all(
      fetch.mock.calls.map(
        async ([input, init]) => await new Request(input, init).text()
      )
    );
    expect(requests).toStrictEqual(
      expect.arrayContaining([expect.stringContaining(slot.date)])
    );
  });

  it("follows deferred history and blockout page cursors without changing the plan date", async () => {
    const { transport, context, cache } = setup();
    // One saved service type, so the window is one chain of calls.
    cache.setQueryData(planReads.serviceTypes(context).queryKey, [
      { id: "1101", name: "Sunday Gathering", sequence: 0 },
    ]);
    const call = vi.spyOn(transport, "handle");
    call.mockResolvedValueOnce({
      ...windowFixture.default,
      deferredPlans: [
        {
          serviceTypeId: "1101",
          planId: "later",
          rosterRequests: 1,
          rangeOffset: 0,
        },
      ],
    });
    call.mockResolvedValueOnce({
      ...windowFixture.default,
      loadedPlanCount: 1,
      deferredPlans: [],
    });
    await cache.query(assignReads.history(context, slot.date));
    expect(call).toHaveBeenLastCalledWith("people.planWindowHistory", {
      date: slot.date,
      serviceTypeId: "1101",
      continuation: {
        plans: [
          {
            serviceTypeId: "1101",
            planId: "later",
            rosterRequests: 1,
            rangeOffset: 0,
          },
        ],
        ranges: [],
      },
    });
    // Only a date page advanced: nobody finished, and the cursor still counts as progress.
    const continuation = {
      people: [
        {
          personId: "a",
          blocked: false,
          blockoutsOffset: null,
          pendingBlockouts: [
            { blockoutId: "daily", timeZone: "UTC", datesOffset: 100 },
          ],
          rehearsalTimes: { plans: [], times: [] },
        },
      ],
    };
    call.mockResolvedValueOnce({
      ...detailsFixture.default,
      people: [],
      deferredPersonIds: ["a"],
      continuation,
    });
    call.mockResolvedValueOnce({
      ...detailsFixture.default,
      people: [{ personId: "a", isBlockedForDate: false }],
      deferredPersonIds: [],
    });
    await cache.query(assignReads.details(context, slot, ["a"], false));
    expect(call).toHaveBeenLastCalledWith("people.candidateDetails", {
      date: slot.date,
      planId: slot.planId,
      personIds: ["a"],
      scheduleHistory: false,
      continuation,
    });
  });

  it("fails rather than repeatedly calling a stalled continuation", async () => {
    const { transport, context, cache } = setup();
    vi.spyOn(transport, "handle").mockResolvedValue({
      ...detailsFixture.default,
      people: [],
      deferredPersonIds: ["a"],
    });
    await expect(
      cache.query(assignReads.details(context, slot, ["a"], false))
    ).rejects.toThrow("Candidate details made no progress.");
  });

  it("isolates query keys by account and queues deliberate warm-ups with speculative priority", async () => {
    const { context, cache, fetch } = setup();
    expect(assignReads.history(context, slot.date).queryKey).not.toStrictEqual(
      assignReads.history({ ...context, scope: "account-b" }, slot.date)
        .queryKey
    );
    await warmCandidates(context, cache, slot);
    const [first] = fetch.mock.calls;
    expect(
      new Request(first[0], first[1]).headers.get("x-pcobooster-priority")
    ).toBe("speculative");
  });

  it("loads details on Hermes, whose AbortSignal has no throwIfAborted", async () => {
    const { context, cache } = setup();
    const original = Object.getOwnPropertyDescriptor(
      AbortSignal.prototype,
      "throwIfAborted"
    );
    Reflect.deleteProperty(AbortSignal.prototype, "throwIfAborted");
    try {
      await expect(
        cache.query(assignReads.details(context, slot, ["4100111"], true))
      ).resolves.toContainEqual({
        personId: "4100111",
        isBlockedForDate: false,
      });
    } finally {
      if (original !== undefined) {
        Object.defineProperty(
          AbortSignal.prototype,
          "throwIfAborted",
          original
        );
      }
    }
  });

  it("keeps at most two detail batches in flight however they are refetched", async () => {
    const { transport, context, cache } = setup();
    const release = Promise.withResolvers<null>();
    let active = 0;
    let maximum = 0;
    vi.spyOn(transport, "handle").mockImplementation(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await release.promise;
      active -= 1;
      return { ...detailsFixture.default, people: [], deferredPersonIds: [] };
    });
    const batches = [["a"], ["b"], ["c"], ["d"], ["e"]];
    const loading = Promise.all(
      batches.map(
        async (ids) =>
          await cache.query(assignReads.details(context, slot, ids, true))
      )
    );
    await vi.waitFor(() => {
      expect(active).toBe(2);
    });
    release.resolve(null);
    await loading;
    expect(maximum).toBe(2);
  });
});

describe(candidateReadState, () => {
  const settled = {
    open: true,
    candidatesLoaded: true,
    candidatesError: null,
    failedParts: 0,
    complete: true,
    released: true,
  };

  it("separates a failed candidate list from failed history or availability, as Swift does", () => {
    const error = new Error("offline");
    expect(
      candidateReadState({
        ...settled,
        candidatesLoaded: false,
        candidatesError: error,
      })
    ).toStrictEqual({
      loading: false,
      candidatesError: error,
      failedParts: 0,
      showsProgress: false,
    });
    expect(
      candidateReadState({ ...settled, complete: false, failedParts: 2 })
    ).toStrictEqual({
      loading: false,
      candidatesError: null,
      failedParts: 2,
      showsProgress: false,
    });
  });

  it("holds name order briefly, then shows progress until history and availability land", () => {
    const partial = { ...settled, complete: false };
    expect(candidateReadState({ ...partial, released: false })).toStrictEqual({
      loading: true,
      candidatesError: null,
      failedParts: 0,
      showsProgress: false,
    });
    expect(candidateReadState(partial)).toStrictEqual({
      loading: false,
      candidatesError: null,
      failedParts: 0,
      showsProgress: true,
    });
    expect(
      candidateReadState({ ...settled, candidatesLoaded: false })
    ).toStrictEqual({
      loading: true,
      candidatesError: null,
      failedParts: 0,
      showsProgress: false,
    });
    expect(
      candidateReadState({ ...settled, open: false, candidatesLoaded: false })
    ).toStrictEqual({
      loading: false,
      candidatesError: null,
      failedParts: 0,
      showsProgress: false,
    });
  });
});
