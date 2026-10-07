import { makeProductClient } from "@pcobooster/client/product-client";
import { AlreadyScheduled } from "@pcobooster/contracts/faults/already-scheduled";
import type {
  FilledPositionPerson,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { makeControlledFixture } from "../../harness/testing/controlled-fixture";
import { assignReads } from "../assign/reads";
import { rosterAssignment } from "./assignment";
import { makeManualTimer } from "./manual-timer";
import { planReads } from "./reads";
import type { ReconcileTimer } from "./reconcile";
import { removeWindowRows, setWindowRowStatus } from "./schedule-optimism";
import type { CandidatesData, HistoryData } from "./schedule-optimism";
import { PlanWriter, sharedPlanWriter } from "./writes";

const ids = { serviceTypeId: "1101", planId: "881261004" };
const setup = async (timer?: ReconcileTimer) => {
  const { transport, fetch } = makeControlledFixture();
  const client = makeProductClient({
    url: "https://fixtures.invalid",
    client: "expo",
    credentials: "omit",
    fetch,
  });
  const context = { client, scope: "test" };
  const cache = new QueryClient();
  const groups = await cache.query(planReads.groups(context, ids));
  const [position] = groups[0].positions;
  const [person] = position.filledPeople ?? [];
  if (person === undefined) {
    throw new Error("The fixture needs a person");
  }
  const onError = vi.fn<(error: Error) => void>();
  const onSuccess = vi.fn<() => void>();
  const writer = new PlanWriter(
    client,
    cache,
    context.scope,
    ids,
    onError,
    onSuccess,
    timer
  );
  return {
    transport,
    client,
    cache,
    context,
    groups,
    position,
    person,
    onError,
    onSuccess,
    writer,
  };
};

describe("plan writes through the product client", () => {
  it("creates a plan-only position locally and persists its first one-off assignment", async () => {
    const { writer, position, cache, context, client } = await setup();
    const custom = writer.addPosition(position.teamId, "Banjo");
    if (custom === undefined) {
      throw new Error("Expected custom position");
    }
    expect(
      cache
        .getQueryData<TeamPositionGroup[]>(
          planReads.groups(context, ids).queryKey
        )?.[0]
        .positions.some((slot) => slot.id === custom.id)
    ).toBeTruthy();
    await expect(
      writer.assign(
        { id: "4100111", fullName: "Avery Woods", photoThumbnailUrl: null },
        custom,
        "Band",
        true
      )
    ).resolves.toBe("scheduled");
    const targetClientNative1 = client;
    const inputNative1 = ids;
    const groups = await targetClientNative1.run((api) =>
      api.catalog.teamPositions({
        params: inputNative1,
        query: {},
      })
    );
    expect(
      groups[0].positions.find((slot) => slot.id === custom.id)
        ?.filledPeople?.[0].personId
    ).toBe("4100111");
  });

  it("serializes rapid adjustments and preserves their result on refetch", async () => {
    const { client, position, writer, onSuccess, onError } = await setup();
    await Promise.all([
      writer.adjust(position, "add"),
      writer.adjust(position, "add"),
      writer.adjust(position, "remove"),
    ]);
    const targetClientNative2 = client;
    const inputNative2 = ids;
    const groups = await targetClientNative2.run((api) =>
      api.catalog.teamPositions({
        params: inputNative2,
        query: {},
      })
    );
    expect(groups[0].positions[0].neededCount).toBe(2);
    expect(onSuccess).toHaveBeenCalledTimes(3);
    expect(onError).not.toHaveBeenCalled();
  });

  it("persists a confirmation in the fixture transport and cache", async () => {
    const { client, writer, person, cache, context, position } = await setup();
    await writer.setStatus(
      rosterAssignment(ids, position, person),
      "confirmed"
    );
    const targetClientNative3 = client;
    const inputNative3 = ids;
    const groups = await targetClientNative3.run((api) =>
      api.catalog.teamPositions({
        params: inputNative3,
        query: {},
      })
    );
    expect(groups[0].positions[0].filledPeople?.[0].rawStatus).toBe("C");
    expect(
      cache.getQueryData(planReads.groups(context, ids).queryKey)
    ).toStrictEqual(groups);
  });

  it.each(["decline", "remove"])(
    "removes the person on %s without changing requested open slots",
    async (action) => {
      const { client, writer, person, position } = await setup();
      await (action === "decline"
        ? writer.setStatus(rosterAssignment(ids, position, person), "declined")
        : writer.remove(rosterAssignment(ids, position, person)));
      const targetClientNative4 = client;
      const inputNative4 = ids;
      const groups = await targetClientNative4.run((api) =>
        api.catalog.teamPositions({
          params: inputNative4,
          query: {},
        })
      );
      expect(groups[0].positions[0].filledPeople).toStrictEqual([]);
      expect(groups[0].positions[0].neededCount).toBe(1);
      expect(groups[0].positions[0].filledConfirmedCount).toBe(0);
    }
  );

  it("restores a declined person immediately when their response becomes confirmed", async () => {
    const { writer, person, cache, context, client, position } = await setup();
    await writer.setStatus(rosterAssignment(ids, position, person), "declined");
    const restoring = writer.setStatus(
      rosterAssignment(ids, position, person),
      "confirmed"
    );
    const optimistic = cache.getQueryData<TeamPositionGroup[]>(
      planReads.groups(context, ids).queryKey
    )?.[0].positions[0];
    expect(optimistic?.filledPeople?.[0].rawStatus).toBe("C");
    expect(optimistic?.neededCount).toBe(1);
    await expect(restoring).resolves.toBeTruthy();
    const targetClientNative5 = client;
    const inputNative5 = ids;
    const groups = await targetClientNative5.run((api) =>
      api.catalog.teamPositions({
        params: inputNative5,
        query: {},
      })
    );
    expect(groups[0].positions[0].filledPeople?.[0].rawStatus).toBe("C");
    expect(groups[0].positions[0].neededCount).toBe(1);
  });

  it("rolls back a failed restoration and can retry a pending response", async () => {
    const {
      transport,
      writer,
      person,
      cache,
      context,
      client,
      onError,
      position,
    } = await setup();
    await writer.setStatus(rosterAssignment(ids, position, person), "declined");
    vi.spyOn(transport, "handle").mockRejectedValueOnce(new Error("offline"));
    await expect(
      writer.setStatus(rosterAssignment(ids, position, person), "confirmed")
    ).resolves.toBeFalsy();
    expect(
      cache.getQueryData<TeamPositionGroup[]>(
        planReads.groups(context, ids).queryKey
      )?.[0].positions[0].filledPeople
    ).toStrictEqual([]);
    expect(onError).toHaveBeenCalledOnce();
    await expect(
      writer.setStatus(rosterAssignment(ids, position, person), "pending")
    ).resolves.toBeTruthy();
    const targetClientNative6 = client;
    const inputNative6 = ids;
    const groups = await targetClientNative6.run((api) =>
      api.catalog.teamPositions({
        params: inputNative6,
        query: {},
      })
    );
    expect({
      status: groups[0].positions[0].filledPeople?.[0].rawStatus,
      open: groups[0].positions[0].neededCount,
    }).toStrictEqual({ status: "U" as const, open: 1 });
  });

  it("rolls back a failed write, reports the failure, and stays usable", async () => {
    const { cache, context, groups, person, onError, onSuccess, position } =
      await setup();
    const client = makeProductClient({
      url: "https://fixtures.invalid",
      client: "expo",
      fetch: vi
        .fn<typeof globalThis.fetch>()
        .mockRejectedValue(new Error("network is offline")),
    });
    const writer = new PlanWriter(
      client,
      cache,
      context.scope,
      ids,
      onError,
      onSuccess
    );
    await expect(
      writer.setStatus(rosterAssignment(ids, position, person), "pending")
    ).resolves.toBeFalsy();
    await expect(
      writer.remove(rosterAssignment(ids, position, person))
    ).resolves.toBeFalsy();
    expect(
      cache.getQueryData(planReads.groups(context, ids).queryKey)
    ).toStrictEqual(groups);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("keeps fixtures isolated per client and blocks a slot control without a record", async () => {
    const { client, writer, position, onSuccess } = await setup();
    const other = await setup();
    await writer.adjust(position, "add");
    const targetClientNative7 = client;
    const inputNative7 = ids;
    const current = await targetClientNative7.run((api) =>
      api.catalog.teamPositions({
        params: inputNative7,
        query: {},
      })
    );
    const targetClientNative8 = other.client;
    const inputNative8 = ids;
    const untouched = await targetClientNative8.run((api) =>
      api.catalog.teamPositions({
        params: inputNative8,
        query: {},
      })
    );
    expect(current[0].positions[0].neededCount).toBe(2);
    expect(untouched[0].positions[0].neededCount).toBe(1);
    await expect(
      writer.adjust(
        {
          ...position,
          id: "missing",
          neededCount: 0,
          neededPositionId: undefined,
        },
        "add"
      )
    ).resolves.toBeFalsy();
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("updates the cache synchronously and rejects a rapid second removal at zero", async () => {
    const { writer, position, cache, context } = await setup();
    const first = writer.adjust(position, "remove");
    const current = cache.getQueryData<TeamPositionGroup[]>(
      planReads.groups(context, ids).queryKey
    );
    expect(current?.[0].positions[0].neededCount).toBe(0);
    await expect(writer.adjust(position, "remove")).resolves.toBeFalsy();
    await first;
  });

  it("rolls back only the failed edit while a second write is pending and refetches once, after a quiet delay", async () => {
    const reconcile = makeManualTimer();
    const { transport, writer, position, person, cache, context } = await setup(
      reconcile.timer
    );
    const original = transport.handle.bind(transport);
    const call = vi.spyOn(transport, "handle");
    const firstCall = Promise.withResolvers<never>();
    const secondCall = Promise.withResolvers<null>();
    call.mockImplementationOnce(async () => await firstCall.promise);
    call.mockImplementationOnce(async (name, input, options) => {
      await secondCall.promise;
      return await original(name, input, options);
    });
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    const first = writer.setStatus(
      rosterAssignment(ids, position, person),
      "pending"
    );
    const second = writer.adjust(position, "add");
    const key = planReads.groups(context, ids).queryKey;
    expect(
      cache.getQueryData<TeamPositionGroup[]>(key)?.[0].positions[0].neededCount
    ).toBe(2);
    await vi.waitFor(() => {
      expect(call).toHaveBeenCalledOnce();
    });
    firstCall.reject(new Error("first failed"));
    await expect(first).resolves.toBeFalsy();
    const result =
      cache.getQueryData<TeamPositionGroup[]>(key)?.[0].positions[0];
    expect({
      status: result?.filledPeople?.[0].rawStatus,
      open: result?.neededCount,
    }).toStrictEqual({ status: person.rawStatus, open: 2 });
    expect(invalidate).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(call).toHaveBeenCalledTimes(2);
    });
    secondCall.resolve(null);
    await second;
    const waiting = {
      delays: reconcile.pending(),
      calls: invalidate.mock.calls.length,
    };
    reconcile.fire();
    expect({ ...waiting, fired: invalidate.mock.calls.length }).toStrictEqual({
      delays: [2500, 2500, 2500, 2500, 2500],
      calls: 0,
      fired: 5,
    });
  });

  it("never refetches the roster over a roster write queued behind a time write", async () => {
    const reconcile = makeManualTimer();
    const { transport, writer, person, position, cache, context } = await setup(
      reconcile.timer
    );
    const [time] = await cache.query(planReads.times(context, ids));
    const original = transport.handle.bind(transport);
    const call = vi.spyOn(transport, "handle");
    const timeCall = Promise.withResolvers<null>();
    const rosterCall = Promise.withResolvers<null>();
    call.mockImplementationOnce(async (name, input, options) => {
      await timeCall.promise;
      return await original(name, input, options);
    });
    call.mockImplementationOnce(async (name, input, options) => {
      await rosterCall.promise;
      return await original(name, input, options);
    });
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    const timeWrite = writer.content.updateTime(
      { planTimeId: time.id, name: "Band call" },
      { ...time, name: "Band call" }
    );
    const rosterWrite = writer.setStatus(
      rosterAssignment(ids, position, person),
      "confirmed"
    );
    timeCall.resolve(null);
    await timeWrite;
    reconcile.fire();
    const groups = planReads.groups(context, ids).queryKey;
    const refetched = () =>
      invalidate.mock.calls.filter(
        ([filters]) =>
          JSON.stringify(filters?.queryKey) === JSON.stringify(groups)
      ).length;
    const whilePending = refetched();
    rosterCall.resolve(null);
    await rosterWrite;
    reconcile.fire();
    expect([whilePending, refetched()]).toStrictEqual([0, 1]);
  });
});

describe("shared plan writers", () => {
  it("shares a queue for the same client scope and plan, with isolated accounts and caches", async () => {
    const { client, cache, context, onError, onSuccess } = await setup();
    const writer = sharedPlanWriter(
      client,
      cache,
      context.scope,
      ids,
      onError,
      onSuccess
    );
    expect(
      sharedPlanWriter(client, cache, context.scope, ids, onError, onSuccess)
    ).toBe(writer);
    expect(
      sharedPlanWriter(client, cache, "other", ids, onError, onSuccess)
    ).not.toBe(writer);
    expect(
      sharedPlanWriter(
        client,
        new QueryClient(),
        context.scope,
        ids,
        onError,
        onSuccess
      )
    ).not.toBe(writer);
    expect(
      sharedPlanWriter(
        client,
        cache,
        context.scope,
        { ...ids, planId: "other" },
        onError,
        onSuccess
      )
    ).not.toBe(writer);
  });
});

describe("assign writes", () => {
  const candidate = {
    id: "4100102",
    fullName: "Hayden Collins",
    photoThumbnailUrl: null,
  };

  it("adds a pending person immediately, replaces their temporary id, and survives refetch", async () => {
    const { writer, position, cache, context, client, onSuccess } =
      await setup();
    const job = writer.assign(candidate, position, "Band", false);
    const optimistic = cache.getQueryData<TeamPositionGroup[]>(
      planReads.groups(context, ids).queryKey
    )?.[0].positions[0];
    expect(
      optimistic?.filledPeople?.find((p) => p.personId === candidate.id)
        ?.rawStatus
    ).toBe("U");
    expect(optimistic?.neededCount).toBe(0);
    await job;
    const targetClientNative9 = client;
    const inputNative9 = ids;
    const groups = await targetClientNative9.run((api) =>
      api.catalog.teamPositions({
        params: inputNative9,
        query: {},
      })
    );
    const added = groups[0].positions[0].filledPeople?.find(
      (p) => p.personId === candidate.id
    );
    expect(added?.planPersonId).not.toContain("optimistic:");
    expect({
      name: added?.name,
      pending: groups[0].positions[0].filledPendingCount,
    }).toStrictEqual({ name: candidate.fullName, pending: 1 });
    expect({
      successCount: onSuccess.mock.calls.length,
      cached: cache.getQueryData(planReads.groups(context, ids).queryKey),
    }).toStrictEqual({ successCount: 1, cached: groups });
  });

  it("settles an already-scheduled response as Swift does without an error toast", async () => {
    const { transport, writer, position, onError, onSuccess } = await setup();
    vi.spyOn(transport, "handle").mockRejectedValueOnce(
      new AlreadyScheduled({ message: "Already scheduled" })
    );
    await expect(
      writer.assign(
        { id: "4100111", fullName: "Avery Woods", photoThumbnailUrl: null },
        position,
        "Band",
        false
      )
    ).resolves.toBe("scheduled");
    expect(onError).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("treats a duplicate tap as already scheduled and rolls back a failed assignment only", async () => {
    const {
      transport,
      writer,
      position,
      cache,
      context,

      groups,
      onError,
    } = await setup();
    const failure = Promise.withResolvers<never>();
    vi.spyOn(transport, "handle").mockImplementationOnce(
      async () => await failure.promise
    );
    const first = writer.assign(candidate, position, "Band", false);
    await expect(
      writer.assign(candidate, position, "Band", false)
    ).resolves.toBe("already");
    failure.reject(new Error("Cannot assign"));
    await expect(first).resolves.toBeInstanceOf(Error);
    expect(
      cache.getQueryData(planReads.groups(context, ids).queryKey)
    ).toStrictEqual(groups);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("treats someone already on the position as scheduled without a write", async () => {
    const { transport, writer, position, person, onError } = await setup();
    const call = vi.spyOn(transport, "handle");
    await expect(
      writer.assign(
        {
          id: person.personId ?? person.id,
          fullName: person.name,
          photoThumbnailUrl: null,
        },
        position,
        "Band",
        true
      )
    ).resolves.toBe("already");
    expect(call).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps concurrent assignments in order and supports one-off people", async () => {
    const { writer, position, client, cache, context } = await setup();
    const second = { ...candidate, id: "4100999", fullName: "Guest Musician" };
    await Promise.all([
      writer.assign(candidate, position, "Band", false),
      writer.assign(second, position, "Band", true),
    ]);
    const targetClientNative10 = client;
    const inputNative10 = ids;
    const groups = await targetClientNative10.run((api) =>
      api.catalog.teamPositions({
        params: inputNative10,
        query: {},
      })
    );
    expect(groups[0].positions[0].filledPeople?.map((p) => p.name)).toContain(
      second.fullName
    );
    expect(groups[0].positions[0].filledPendingCount).toBe(2);
    expect(groups[0].positions[0].neededCount).toBe(0);
    expect(
      cache.getQueryData(planReads.groups(context, ids).queryKey)
    ).toStrictEqual(groups);
  });
});

describe("schedule writes settle the candidate reads", () => {
  const slot = {
    serviceTypeId: ids.serviceTypeId,
    planId: ids.planId,
    teamId: "2201",
    positionId: "3301",
    date: "2026-10-04T16:00:00.000Z",
  };
  const hayden = {
    id: "4100102",
    fullName: "Hayden Collins",
    photoThumbnailUrl: null,
  };
  const seeded = async () => {
    const base = await setup();
    const { cache, context } = base;
    const candidatesKey = assignReads.candidates(context, slot).queryKey;
    const historyKey = assignReads.history(context, slot.date).queryKey;
    await cache.query(assignReads.candidates(context, slot));
    await cache.query(assignReads.history(context, slot.date));
    await cache.query(assignReads.details(context, slot, ["4100104"], true));
    await cache.query(assignReads.details(context, slot, ["4100104"], false));
    const slotOf = (personId: string) =>
      cache
        .getQueryData<CandidatesData>(candidatesKey)
        ?.candidates.find((candidate) => candidate.id === personId)
        ?.selectedPlanSlot;
    const rowsOf = (planPersonId: string) =>
      (cache.getQueryData<HistoryData>(historyKey) ?? []).flatMap((call) =>
        call.people.flatMap((person) =>
          person.rows.filter((row) => row.id === planPersonId)
        )
      );
    return { ...base, candidatesKey, historyKey, slotOf, rowsOf };
  };

  it("schedules the candidate at once, keeps the real id, and invalidates candidates, history, and history details on settle", async () => {
    const {
      writer,
      position,
      cache,
      context,
      slotOf,
      candidatesKey,
      historyKey,
    } = await seeded();
    const job = writer.assign(hayden, position, "Band", false);
    expect(slotOf(hayden.id)?.status).toBe("pending");
    await job;
    expect(slotOf(hayden.id)?.planPersonId).not.toContain("optimistic:");
    await vi.waitFor(
      () => {
        expect(cache.getQueryState(candidatesKey)?.isInvalidated).toBeTruthy();
      },
      { timeout: 4000 }
    );
    const state = (key: readonly unknown[]) => cache.getQueryState(key);
    expect({
      candidates: state(candidatesKey)?.isInvalidated,
      history: state(historyKey)?.isInvalidated,
      historyDetails: state(
        assignReads.details(context, slot, ["4100104"], true).queryKey
      )?.isInvalidated,
      blockoutDetails: state(
        assignReads.details(context, slot, ["4100104"], false).queryKey
      )?.isInvalidated,
    }).toStrictEqual({
      candidates: true,
      history: true,
      historyDetails: true,
      blockoutDetails: false,
    });
  });

  it("rolls back the candidate when the assignment fails", async () => {
    const { transport, writer, position, slotOf } = await seeded();
    vi.spyOn(transport, "handle").mockRejectedValueOnce(new Error("offline"));
    await expect(
      writer.assign(hayden, position, "Band", false)
    ).resolves.toBeInstanceOf(Error);
    expect(slotOf(hayden.id)).toBeNull();
  });

  it.each([
    ["Band - Acoustic Guitar", "Acoustic Guitar", true],
    ["Acoustic Guitar", "Acoustic Guitar", true],
    [" band - ACOUSTIC GUITAR ", " Acoustic Guitar ", true],
    ["Band - Vocals - Lead", "Vocals - Lead", true],
    ["Vocals - Lead", "Vocals - Lead", true],
    ["Other - Acoustic Guitar", "Acoustic Guitar", false],
    ["Band - Keys", "Acoustic Guitar", false],
  ])(
    "matches history label %s to slot %s only when appropriate",
    async (label, name, matches) => {
      const { cache, historyKey, person, position } = await seeded();
      const history = cache.getQueryData<HistoryData>(historyKey) ?? [];
      const calls = history.map((call) => ({
        ...call,
        people: call.people.map((entry) => ({
          ...entry,
          rows: entry.rows.map((row) =>
            row.id === person.planPersonId
              ? { ...row, teamPositionName: label }
              : row
          ),
        })),
      }));
      const assignment = rosterAssignment(ids, position, person);
      const rows = (data: HistoryData) =>
        data.flatMap((call) =>
          call.people.flatMap((entry) =>
            entry.rows.filter((row) => row.id === person.planPersonId)
          )
        );
      expect(
        rows(
          setWindowRowStatus(
            calls,
            assignment.identity,
            name,
            "declined",
            "Band"
          )
        ).map((row) => row.status)
      ).toStrictEqual([matches ? "D" : "C"]);
      expect(
        rows(removeWindowRows(calls, assignment.identity, name, "Band"))
      ).toHaveLength(matches ? 0 : 1);
    }
  );

  it.each(["declined", "remove"] as const)(
    "rolls back prefixed history for failed %s while a later write is held",
    async (action) => {
      const {
        transport,
        writer,

        cache,
        historyKey,
        person,
        position,
        rowsOf,
        slotOf,
        context,
      } = await seeded();
      cache.setQueryData<HistoryData>(historyKey, (calls) =>
        calls?.map((call) => ({
          ...call,
          people: call.people.map((entry) => ({
            ...entry,
            rows: entry.rows.map((row) =>
              row.id === person.planPersonId
                ? { ...row, teamPositionName: `Band - ${position.name}` }
                : row
            ),
          })),
        }))
      );
      const call = transport.handle.bind(transport);
      const failGate = Promise.withResolvers<boolean>();
      const laterGate = Promise.withResolvers<boolean>();
      vi.spyOn(transport, "handle").mockImplementation(async (name, input) => {
        if (name === "schedule.updateStatus" || name === "schedule.remove") {
          await failGate.promise;
          throw new Error("offline write");
        }
        if (name === "neededPositions.adjust") {
          await laterGate.promise;
        }
        return await call(name, input);
      });
      const assignment = rosterAssignment(ids, position, person);
      const editing =
        action === "remove"
          ? writer.remove(assignment)
          : writer.setStatus(assignment, action);
      expect(
        rowsOf(person.planPersonId).map((row) => row.status)
      ).toStrictEqual(action === "remove" ? [] : ["D"]);
      const later = writer.adjust(position, "add");
      failGate.resolve(true);
      try {
        await expect(editing).resolves.toBeFalsy();
        expect(
          rowsOf(person.planPersonId).map((row) => row.status)
        ).toStrictEqual(["C"]);
        expect(slotOf(person.personId ?? person.id)?.status).toBe("confirmed");
        expect(
          cache.getQueryData<TeamPositionGroup[]>(
            planReads.groups(context, ids).queryKey
          )?.[0].positions[0]
        ).toMatchObject({
          filledConfirmedCount: position.filledConfirmedCount,
          neededCount: (position.neededCount ?? 0) + 1,
        });
      } finally {
        laterGate.resolve(true);
        await later;
      }
    }
  );

  it("declines a candidate and their history row at once, then unschedules both", async () => {
    const { writer, person, position, slotOf, rowsOf } = await seeded();
    const declining = writer.setStatus(
      rosterAssignment(ids, position, person),
      "declined"
    );
    expect({
      slot: slotOf("4100104")?.status,
      rows: rowsOf(person.planPersonId).map((row) => row.status),
    }).toStrictEqual({ slot: "declined", rows: ["D"] });
    await declining;
    const removing = writer.remove(rosterAssignment(ids, position, person));
    expect({
      slot: slotOf("4100104"),
      rows: rowsOf(person.planPersonId),
    }).toStrictEqual({ slot: null, rows: [] });
    await removing;
  });
});

describe("settled writes leave fresh reads alone", () => {
  it("lets a refetched response win over an earlier decline on the next write", async () => {
    const { writer, person, position, cache, context } = await setup();
    const slot = {
      serviceTypeId: ids.serviceTypeId,
      planId: ids.planId,
      teamId: "2201",
      positionId: "3301",
      date: "2026-10-04T16:00:00.000Z",
    };
    const key = assignReads.candidates(context, slot).queryKey;
    const fresh = await cache.query(assignReads.candidates(context, slot));
    await writer.setStatus(rosterAssignment(ids, position, person), "declined");
    cache.setQueryData(key, fresh);
    const adjusting = writer.adjust(position, "add");
    expect(
      cache
        .getQueryData<CandidatesData>(key)
        ?.candidates.find((candidate) => candidate.id === "4100104")
        ?.selectedPlanSlot?.status
    ).toBe("confirmed");
    await adjusting;
  });
});

describe("writes on a person whose assignment is still saving", () => {
  const hayden = {
    id: "4100102",
    fullName: "Hayden Collins",
    photoThumbnailUrl: null,
  };

  it.each(["confirm", "remove"])(
    "sends the saved plan person id to %s",
    async (action) => {
      const { transport, writer, position, client, cache, context, onError } =
        await setup();
      const call = vi.spyOn(transport, "handle");
      const assigning = writer.assign(hayden, position, "Band", false);
      const optimistic = cache
        .getQueryData<TeamPositionGroup[]>(
          planReads.groups(context, ids).queryKey
        )?.[0]
        .positions[0].filledPeople?.find((p) => p.personId === hayden.id);
      if (optimistic === undefined) {
        throw new Error("Expected the optimistic row");
      }
      const editing =
        action === "confirm"
          ? writer.setStatus(
              rosterAssignment(ids, position, optimistic),
              "confirmed"
            )
          : writer.remove(rosterAssignment(ids, position, optimistic));
      await assigning;
      await expect(editing).resolves.toBeTruthy();
      const sent = call.mock.calls.filter(
        ([name]) =>
          name === "schedule.updateStatus" || name === "schedule.remove"
      );
      expect(sent).toHaveLength(1);
      expect(JSON.stringify(sent)).not.toContain("optimistic:");
      expect(onError).not.toHaveBeenCalled();
      const targetClientNative11 = client;
      const inputNative11 = ids;
      const groups = await targetClientNative11.run((api) =>
        api.catalog.teamPositions({
          params: inputNative11,
          query: {},
        })
      );
      const saved = groups[0].positions[0].filledPeople?.find(
        (p) => p.personId === hayden.id
      );
      expect(saved?.rawStatus).toBe(action === "confirm" ? "C" : undefined);
    }
  );

  it.each([
    { actions: ["confirm"], rows: [["confirmed", false]], confirmed: 1 },
    { actions: ["confirm", "remove"], rows: [], confirmed: 0 },
    { actions: ["remove"], rows: [], confirmed: 0 },
  ])(
    "keeps one saved row in the cached lineup for $actions before the queue settles",
    async ({ actions, rows, confirmed }) => {
      const { transport, writer, position, cache, context } = await setup();
      const call = transport.handle.bind(transport);
      const gate = Promise.withResolvers<boolean>();
      const assignGate = Promise.withResolvers<boolean>();
      vi.spyOn(transport, "handle").mockImplementation(async (name, input) => {
        if (name === "schedule.assign") {
          await assignGate.promise;
        }
        if (name === "schedule.updateStatus" || name === "schedule.remove") {
          await gate.promise;
        }
        return await call(name, input);
      });
      const key = planReads.groups(context, ids).queryKey;
      const slot = () =>
        cache
          .getQueryData<TeamPositionGroup[]>(key)?.[0]
          .positions.find((candidate) => candidate.id === position.id);
      const assigning = writer.assign(hayden, position, "Band", false);
      const optimistic = slot()?.filledPeople?.find(
        (p) => p.personId === hayden.id
      );
      if (optimistic === undefined) {
        throw new Error("Expected the optimistic row");
      }
      const editing: Promise<boolean>[] = [];
      for (const action of actions) {
        editing.push(
          action === "confirm"
            ? writer.setStatus(
                rosterAssignment(ids, position, optimistic),
                "confirmed"
              )
            : writer.remove(rosterAssignment(ids, position, optimistic))
        );
      }
      expect({
        rows: (slot()?.filledPeople ?? [])
          .filter((p) => p.personId === hayden.id)
          .map((p) => [p.status, p.planPersonId.startsWith("optimistic:")]),
        confirmed: slot()?.filledConfirmedCount,
        pending: slot()?.filledPendingCount,
        open: slot()?.neededCount,
      }).toStrictEqual({
        rows: rows.map(([status]) => [status, true]),
        confirmed: confirmed + (position.filledConfirmedCount ?? 0),
        pending: position.filledPendingCount ?? 0,
        open: Math.max(0, (position.neededCount ?? 0) - 1),
      });
      assignGate.resolve(true);
      await assigning;
      const pending = slot();
      expect({
        rows: (pending?.filledPeople ?? [])
          .filter((p) => p.personId === hayden.id)
          .map((p) => [p.status, p.planPersonId.startsWith("optimistic:")]),
        confirmed: pending?.filledConfirmedCount,
        pending: pending?.filledPendingCount,
      }).toStrictEqual({
        rows,
        confirmed: confirmed + (position.filledConfirmedCount ?? 0),
        pending: position.filledPendingCount ?? 0,
      });
      gate.resolve(true);
      await Promise.all(editing);
    }
  );

  it("drops a status change quietly when the assignment it depends on failed", async () => {
    const { transport, writer, position, cache, context, onError } =
      await setup();
    vi.spyOn(transport, "handle").mockRejectedValueOnce(new Error("offline"));
    const assigning = writer.assign(hayden, position, "Band", false);
    const optimistic = cache
      .getQueryData<TeamPositionGroup[]>(
        planReads.groups(context, ids).queryKey
      )?.[0]
      .positions[0].filledPeople?.find((p) => p.personId === hayden.id);
    if (optimistic === undefined) {
      throw new Error("Expected the optimistic row");
    }
    const editing = writer.setStatus(
      rosterAssignment(ids, position, optimistic),
      "confirmed"
    );
    await assigning;
    await expect(editing).resolves.toBeFalsy();
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe("a status change after a failed assignment", () => {
  it("never shows the unsaved person again", async () => {
    const { transport, writer, position, cache, context, onError } =
      await setup();
    vi.spyOn(transport, "handle").mockRejectedValueOnce(new Error("offline"));
    const key = planReads.groups(context, ids).queryKey;
    const hayden = (): boolean =>
      cache
        .getQueryData<TeamPositionGroup[]>(key)?.[0]
        .positions.some(
          (slot) =>
            slot.filledPeople?.some((p) => p.personId === "4100102") === true
        ) === true;
    const assigning = writer.assign(
      { id: "4100102", fullName: "Hayden Collins", photoThumbnailUrl: null },
      position,
      "Band",
      false
    );
    const optimistic = cache
      .getQueryData<TeamPositionGroup[]>(key)?.[0]
      .positions[0].filledPeople?.find((p) => p.personId === "4100102");
    if (optimistic === undefined) {
      throw new Error("Expected the optimistic row");
    }
    const ghosts: boolean[] = [];
    const unsubscribe = cache.getQueryCache().subscribe(() => {
      if (onError.mock.calls.length > 0) {
        ghosts.push(hayden());
      }
    });
    const editing = writer.setStatus(
      rosterAssignment(ids, position, optimistic),
      "confirmed"
    );
    await assigning;
    await editing;
    unsubscribe();
    expect(ghosts.length).toBeGreaterThan(0);
    expect(ghosts.filter(Boolean)).toStrictEqual([]);
  });
});

describe("unscheduling forgets a declined person", () => {
  it("does not put an unscheduled person back on the lineup for a later status change", async () => {
    const { writer, person, cache, context, position } = await setup();
    await writer.setStatus(rosterAssignment(ids, position, person), "declined");
    await writer.remove(rosterAssignment(ids, position, person));
    void writer
      .setStatus(rosterAssignment(ids, position, person), "confirmed")
      .catch(() => false);
    expect(
      cache.getQueryData<TeamPositionGroup[]>(
        planReads.groups(context, ids).queryKey
      )?.[0].positions[0].filledPeople
    ).toStrictEqual([]);
  });
});

describe("stable assignment restoration races", () => {
  const hayden = {
    id: "4100102",
    fullName: "Hayden Collins",
    photoThumbnailUrl: null,
  };

  it("restores the cached roster from a refreshed saved-ID candidate after an early decline", async () => {
    const { transport, writer, position, client, cache, context } =
      await setup();
    const call = transport.handle.bind(transport);
    const assignGate = Promise.withResolvers<boolean>();
    const confirmGate = Promise.withResolvers<boolean>();
    let statusCalls = 0;
    vi.spyOn(transport, "handle").mockImplementation(async (name, input) => {
      if (name === "schedule.assign") {
        await assignGate.promise;
      }
      if (name === "schedule.updateStatus") {
        statusCalls += 1;
        if (statusCalls === 2) {
          await confirmGate.promise;
        }
      }
      return await call(name, input);
    });
    const key = planReads.groups(context, ids).queryKey;
    const slot = () =>
      cache.getQueryData<TeamPositionGroup[]>(key)?.[0].positions[0];
    const assigning = writer.assign(hayden, position, "Band", false);
    const optimistic = slot()?.filledPeople?.find(
      (p) => p.personId === hayden.id
    );
    if (optimistic === undefined) {
      throw new Error("Expected optimistic assignment");
    }
    const declining = writer.setStatus(
      rosterAssignment(ids, position, optimistic),
      "declined"
    );
    expect(
      slot()?.filledPeople?.some((p) => p.personId === hayden.id)
    ).toBeFalsy();
    assignGate.resolve(true);
    await assigning;
    await declining;
    const targetClientNative12 = client;
    const inputNative12 = {
      ...ids,
      teamId: position.teamId,
      positionId: position.id,
    };
    const candidates = await targetClientNative12.run((api) =>
      api.people.positionCandidates({
        params: inputNative12,
        query: inputNative12,
      })
    );
    const candidate = candidates.candidates.find((p) => p.id === hayden.id);
    const savedId = candidate?.selectedPlanSlot?.planPersonId;
    if (savedId === undefined) {
      throw new Error("Expected saved candidate assignment");
    }
    expect(savedId.startsWith("optimistic:")).toBeFalsy();
    const confirming = writer.setStatus(
      rosterAssignment(ids, position, { ...optimistic, planPersonId: savedId }),
      "confirmed"
    );
    try {
      expect(slot()).toMatchObject({
        filledConfirmedCount: (position.filledConfirmedCount ?? 0) + 1,
        filledPendingCount: position.filledPendingCount ?? 0,
        neededCount: Math.max(0, (position.neededCount ?? 0) - 1),
      });
      expect(
        slot()?.filledPeople?.filter((p) => p.personId === hayden.id)
      ).toMatchObject([{ planPersonId: savedId, status: "confirmed" }]);
    } finally {
      confirmGate.resolve(true);
      await confirming;
    }
  });

  it.each(["confirmed", "pending", "declined"] as const)(
    "does not restore a failed assignment for a later %s while another write is held",
    async (status) => {
      const { transport, writer, position, cache, context, onError } =
        await setup();
      const call = transport.handle.bind(transport);
      const gate = Promise.withResolvers<boolean>();
      const spy = vi
        .spyOn(transport, "handle")
        .mockImplementation(async (name, input) => {
          if (name === "schedule.assign") {
            throw new Error("offline");
          }
          if (name === "neededPositions.adjust") {
            await gate.promise;
          }
          return await call(name, input);
        });
      const key = planReads.groups(context, ids).queryKey;
      const assigning = writer.assign(hayden, position, "Band", false);
      const optimistic = cache
        .getQueryData<TeamPositionGroup[]>(key)?.[0]
        .positions[0].filledPeople?.find((p) => p.personId === hayden.id);
      if (optimistic === undefined) {
        throw new Error("Expected optimistic assignment");
      }
      const adjusting = writer.adjust(position, "add");
      await assigning;
      const editing = writer.setStatus(
        rosterAssignment(ids, position, optimistic),
        status
      );
      try {
        const current =
          cache.getQueryData<TeamPositionGroup[]>(key)?.[0].positions[0];
        expect(
          current?.filledPeople?.some((p) => p.personId === hayden.id)
        ).toBeFalsy();
        expect(current).toMatchObject({
          filledConfirmedCount: position.filledConfirmedCount,
          neededCount: (position.neededCount ?? 0) + 1,
        });
      } finally {
        gate.resolve(true);
        await adjusting;
        await expect(editing).resolves.toBeFalsy();
      }
      expect(
        spy.mock.calls.filter(([name]) => name === "schedule.updateStatus")
      ).toStrictEqual([]);
      expect(onError).toHaveBeenCalledOnce();
    }
  );

  it("rolls back failed status after assign while a later adjustment remains pending", async () => {
    const { transport, writer, position, cache, context } = await setup();
    const call = transport.handle.bind(transport);
    const gate = Promise.withResolvers<boolean>();
    vi.spyOn(transport, "handle").mockImplementation(async (name, input) => {
      if (name === "schedule.updateStatus") {
        throw new Error("offline status");
      }
      if (name === "neededPositions.adjust") {
        await gate.promise;
      }
      return await call(name, input);
    });
    const key = planReads.groups(context, ids).queryKey;
    const assigning = writer.assign(hayden, position, "Band", false);
    const optimistic = cache
      .getQueryData<TeamPositionGroup[]>(key)?.[0]
      .positions[0].filledPeople?.find((p) => p.personId === hayden.id);
    if (optimistic === undefined) {
      throw new Error("Expected optimistic assignment");
    }
    const confirming = writer.setStatus(
      rosterAssignment(ids, position, optimistic),
      "confirmed"
    );
    const adjusting = writer.adjust(position, "add");
    await assigning;
    await expect(confirming).resolves.toBeFalsy();
    try {
      const current =
        cache.getQueryData<TeamPositionGroup[]>(key)?.[0].positions[0];
      expect(
        current?.filledPeople?.filter((p) => p.personId === hayden.id)
      ).toMatchObject([{ status: "pending" }]);
      expect(current).toMatchObject({
        filledConfirmedCount: position.filledConfirmedCount,
        filledPendingCount: (position.filledPendingCount ?? 0) + 1,
        neededCount: position.neededCount,
      });
    } finally {
      gate.resolve(true);
      await adjusting;
    }
  });
});

describe("authoritative assignment reads", () => {
  it("uses the authoritative saved id for a stable assignment after a refetch", async () => {
    const { transport, writer, person, position, cache, context } =
      await setup();
    await writer.setStatus(rosterAssignment(ids, position, person), "pending");
    const key = planReads.groups(context, ids).queryKey;
    const groups = cache.getQueryData<TeamPositionGroup[]>(key);
    if (groups === undefined) {
      throw new Error("Expected roster");
    }
    cache.setQueryData(
      key,
      groups.map((group) => ({
        ...group,
        positions: group.positions.map((slot) => ({
          ...slot,
          filledPeople: slot.filledPeople?.map((p) =>
            p.personId === person.personId
              ? { ...p, planPersonId: "external-reassignment" }
              : p
          ),
        })),
      }))
    );
    const call = vi.spyOn(transport, "handle");
    await writer.setStatus(
      rosterAssignment(ids, position, person),
      "confirmed"
    );
    expect(call).toHaveBeenCalledWith("schedule.updateStatus", {
      ...ids,
      planPersonId: "external-reassignment",
      personId: person.personId,
      status: "C" as const,
    });
  });
});

describe("already scheduled assignment identity", () => {
  it("accepts a refreshed candidate's saved id after an AlreadyScheduled response", async () => {
    const { transport, writer, client, position, cache, context } =
      await setup();
    const hayden = {
      id: "4100102",
      fullName: "Hayden Collins",
      photoThumbnailUrl: null,
    };
    const targetClientNative13 = client;
    const inputNative13 = {
      ...ids,
      personId: hayden.id,
      teamId: position.teamId,
      positionId: position.id,
      teamName: "Band",
      positionName: position.name,
      oneOff: false,
    };
    const saved = await targetClientNative13.run((api) =>
      api.schedule.assign({ params: inputNative13, payload: inputNative13 })
    );
    const spy = vi
      .spyOn(transport, "handle")
      .mockRejectedValueOnce(
        new AlreadyScheduled({ message: "Already scheduled" })
      );
    await expect(writer.assign(hayden, position, "Band", false)).resolves.toBe(
      "scheduled"
    );
    const key = planReads.groups(context, ids).queryKey;
    const optimistic = cache
      .getQueryData<TeamPositionGroup[]>(key)?.[0]
      .positions[0].filledPeople?.find((p) => p.personId === hayden.id);
    if (optimistic === undefined) {
      throw new Error("Expected optimistic row before roster refetch");
    }
    const fresh = { ...optimistic, planPersonId: saved.data.id };
    await writer.setStatus(rosterAssignment(ids, position, fresh), "confirmed");
    expect(spy).toHaveBeenCalledWith("schedule.updateStatus", {
      ...ids,
      personId: hayden.id,
      planPersonId: saved.data.id,
      status: "C" as const,
    });
    expect(
      JSON.stringify(
        spy.mock.calls.filter(([name]) => name === "schedule.updateStatus")
      )
    ).not.toContain("optimistic:");
  });
});

describe("assignments without a Planning Center person relationship", () => {
  it("keeps the optional person id absent in status and removal requests", async () => {
    const {
      transport,
      writer,

      cache,
      context,
      position,
      person,
      groups,
    } = await setup();
    const unknown = { ...person, id: "unknown-person", personId: null };
    cache.setQueryData(
      planReads.groups(context, ids).queryKey,
      groups.map((group) => ({
        ...group,
        positions: group.positions.map((slot) => ({
          ...slot,
          filledPeople: slot.filledPeople?.map((p) =>
            p.planPersonId === person.planPersonId ? unknown : p
          ),
        })),
      }))
    );
    const spy = vi.spyOn(transport, "handle");
    const assignment = rosterAssignment(ids, position, unknown);
    await writer.setStatus(assignment, "pending");
    await writer.remove(assignment);
    expect(spy).toHaveBeenCalledWith("schedule.updateStatus", {
      ...ids,
      planPersonId: person.planPersonId,
      status: "U" as const,
    });
    expect(spy).toHaveBeenCalledWith("schedule.remove", {
      ...ids,
      planPersonId: person.planPersonId,
    });
  });
});

describe("queued actions after provider AlreadyScheduled", () => {
  it.each(["confirmed", "pending", "declined", "remove"] as const)(
    "resolves the saved ID for queued %s before later writes drain",
    async (action) => {
      const { transport, writer, client, cache, context, position, onError } =
        await setup();
      const hayden = {
        id: "4100102",
        fullName: "Hayden Collins",
        photoThumbnailUrl: null,
      };
      const candidateOptions = assignReads.candidates(context, {
        ...ids,
        teamId: position.teamId,
        positionId: position.id,
        date: "2026-10-04T16:00:00.000Z",
      });
      await cache.query(candidateOptions);
      const targetClientNative14 = client;
      const inputNative14 = {
        ...ids,
        personId: hayden.id,
        teamId: position.teamId,
        positionId: position.id,
        teamName: "Band",
        positionName: position.name,
        oneOff: false,
      };
      const saved = await targetClientNative14.run((api) =>
        api.schedule.assign({ params: inputNative14, payload: inputNative14 })
      );
      const call = transport.handle.bind(transport);
      const assignGate = Promise.withResolvers<boolean>();
      const laterGate = Promise.withResolvers<boolean>();
      const spy = vi
        .spyOn(transport, "handle")
        .mockImplementation(async (name, input) => {
          if (name === "schedule.assign") {
            await assignGate.promise;
            throw new AlreadyScheduled({ message: "Already scheduled" });
          }
          if (name === "neededPositions.adjust") {
            await laterGate.promise;
          }
          return await call(name, input);
        });
      const key = planReads.groups(context, ids).queryKey;
      const slot = () =>
        cache.getQueryData<TeamPositionGroup[]>(key)?.[0].positions[0];
      const assigning = writer.assign(hayden, position, "Band", false);
      const optimistic = slot()?.filledPeople?.find(
        (p) => p.personId === hayden.id
      );
      if (optimistic === undefined) {
        throw new Error("Expected optimistic row");
      }
      const assignment = rosterAssignment(ids, position, optimistic);
      const editing =
        action === "remove"
          ? writer.remove(assignment)
          : writer.setStatus(assignment, action);
      const later = writer.adjust(position, "add");
      assignGate.resolve(true);
      await assigning;
      try {
        await expect(editing).resolves.toBeTruthy();
        const absent = action === "declined" || action === "remove";
        expect({
          rows: slot()?.filledPeople?.filter((p) => p.personId === hayden.id),
          candidate: cache
            .getQueryData<CandidatesData>(candidateOptions.queryKey)
            ?.candidates.find((p) => p.id === hayden.id)?.selectedPlanSlot,
        }).toMatchObject({
          rows: absent ? [] : [{ planPersonId: saved.data.id, status: action }],
          candidate:
            action === "remove"
              ? null
              : { planPersonId: saved.data.id, status: action },
        });
        expect(slot()).toMatchObject({
          filledConfirmedCount:
            (position.filledConfirmedCount ?? 0) +
            (action === "confirmed" ? 1 : 0),
          filledPendingCount:
            (position.filledPendingCount ?? 0) + (action === "pending" ? 1 : 0),
          neededCount: position.neededCount,
        });
        expect({
          resolutionCalls: spy.mock.calls.filter(
            ([name]) => name === "people.positionCandidates"
          ).length,
          errors: onError.mock.calls.length,
        }).toStrictEqual({ resolutionCalls: 1, errors: 0 });
        expect(
          spy.mock.calls.filter(
            ([name]) =>
              name ===
              (action === "remove"
                ? "schedule.remove"
                : "schedule.updateStatus")
          )
        ).toMatchObject([
          [
            action === "remove" ? "schedule.remove" : "schedule.updateStatus",
            { planPersonId: saved.data.id },
          ],
        ]);
      } finally {
        laterGate.resolve(true);
        await later;
      }
    }
  );

  it.each(["missing", "offline"])(
    "reports %s resolution and rolls back the dependent action while a later write is held",
    async (failure) => {
      const { transport, writer, cache, context, position, onError } =
        await setup();
      const hayden = {
        id: "4100102",
        fullName: "Hayden Collins",
        photoThumbnailUrl: null,
      };
      const call = transport.handle.bind(transport);
      const laterGate = Promise.withResolvers<boolean>();
      const spy = vi
        .spyOn(transport, "handle")
        .mockImplementation(async (name, input) => {
          if (name === "schedule.assign") {
            throw new AlreadyScheduled({ message: "Already scheduled" });
          }
          if (name === "people.positionCandidates" && failure === "offline") {
            throw new Error("resolution offline");
          }
          if (name === "neededPositions.adjust") {
            await laterGate.promise;
          }
          return await call(name, input);
        });
      const key = planReads.groups(context, ids).queryKey;
      const slot = () =>
        cache.getQueryData<TeamPositionGroup[]>(key)?.[0].positions[0];
      const assigning = writer.assign(hayden, position, "Band", false);
      const optimistic = slot()?.filledPeople?.find(
        (p) => p.personId === hayden.id
      );
      if (optimistic === undefined) {
        throw new Error("Expected optimistic row");
      }
      const editing = writer.setStatus(
        rosterAssignment(ids, position, optimistic),
        "confirmed"
      );
      const later = writer.adjust(position, "add");
      await assigning;
      try {
        await expect(editing).resolves.toBeFalsy();
        expect(onError).toHaveBeenCalledOnce();
        expect(
          slot()?.filledPeople?.filter((p) => p.personId === hayden.id)
        ).toMatchObject([{ status: "pending" }]);
        expect(slot()).toMatchObject({
          filledConfirmedCount: position.filledConfirmedCount,
          filledPendingCount: (position.filledPendingCount ?? 0) + 1,
          neededCount: position.neededCount,
        });
        expect(
          spy.mock.calls.filter(([name]) => name === "schedule.updateStatus")
        ).toStrictEqual([]);
      } finally {
        laterGate.resolve(true);
        await later;
      }
    }
  );
});

describe("authoritative duplicate status rollback", () => {
  it("keeps the resolved confirmed assignment after a refused queued decline", async () => {
    const { transport, writer, client, cache, context, position, onError } =
      await setup();
    const hayden = {
      id: "4100102",
      fullName: "Hayden Collins",
      photoThumbnailUrl: null,
    };
    const targetClientNative15 = client;
    const inputNative15 = {
      ...ids,
      personId: hayden.id,
      teamId: position.teamId,
      positionId: position.id,
      teamName: "Band",
      positionName: position.name,
      oneOff: false,
    };
    const saved = await targetClientNative15.run((api) =>
      api.schedule.assign({ params: inputNative15, payload: inputNative15 })
    );
    const targetClientNative16 = client;
    const inputNative16 = {
      ...ids,
      planPersonId: saved.data.id,
      personId: hayden.id,
      status: "C" as const,
    };
    await targetClientNative16.run((api) =>
      api.schedule.updateStatus({
        params: inputNative16,
        payload: inputNative16,
      })
    );
    const call = transport.handle.bind(transport);
    const laterGate = Promise.withResolvers<boolean>();
    vi.spyOn(transport, "handle").mockImplementation(async (name, input) => {
      if (name === "schedule.assign") {
        throw new AlreadyScheduled({ message: "Already scheduled" });
      }
      if (name === "schedule.updateStatus") {
        throw new Error("refused decline");
      }
      if (name === "neededPositions.adjust") {
        await laterGate.promise;
      }
      return await call(name, input);
    });
    const key = planReads.groups(context, ids).queryKey;
    const assigning = writer.assign(hayden, position, "Band", false);
    const optimistic = cache
      .getQueryData<TeamPositionGroup[]>(key)?.[0]
      .positions[0].filledPeople?.find((p) => p.personId === hayden.id);
    if (optimistic === undefined) {
      throw new Error("Expected optimistic row");
    }
    const declining = writer.setStatus(
      rosterAssignment(ids, position, optimistic),
      "declined"
    );
    const later = writer.adjust(position, "add");
    await assigning;
    try {
      await expect(declining).resolves.toBeFalsy();
      expect(onError).toHaveBeenCalledOnce();
      const current =
        cache.getQueryData<TeamPositionGroup[]>(key)?.[0].positions[0];
      expect(
        current?.filledPeople?.filter((p) => p.personId === hayden.id)
      ).toMatchObject([{ status: "confirmed", planPersonId: saved.data.id }]);
      expect(current).toMatchObject({
        filledConfirmedCount: (position.filledConfirmedCount ?? 0) + 1,
        filledPendingCount: position.filledPendingCount ?? 0,
        neededCount: position.neededCount,
      });
    } finally {
      laterGate.resolve(true);
      await later;
    }
  });
});

describe("shared duplicate resolution for queued closures", () => {
  it("resolves once for early decline and confirm and keeps the cached restored ID while a later adjustment is held", async () => {
    const { transport, writer, client, cache, context, position } =
      await setup();
    const hayden = {
      id: "4100102",
      fullName: "Hayden Collins",
      photoThumbnailUrl: null,
    };
    const targetClientNative17 = client;
    const inputNative17 = {
      ...ids,
      personId: hayden.id,
      teamId: position.teamId,
      positionId: position.id,
      teamName: "Band",
      positionName: position.name,
      oneOff: false,
    };
    const saved = await targetClientNative17.run((api) =>
      api.schedule.assign({ params: inputNative17, payload: inputNative17 })
    );
    const call = transport.handle.bind(transport);
    const gate = Promise.withResolvers<boolean>();
    const spy = vi
      .spyOn(transport, "handle")
      .mockImplementation(async (name, input) => {
        if (name === "schedule.assign") {
          throw new AlreadyScheduled({ message: "Already scheduled" });
        }
        if (name === "neededPositions.adjust") {
          await gate.promise;
        }
        return await call(name, input);
      });
    const key = planReads.groups(context, ids).queryKey;
    const assigning = writer.assign(hayden, position, "Band", false);
    const optimistic = cache
      .getQueryData<TeamPositionGroup[]>(key)?.[0]
      .positions[0].filledPeople?.find((p) => p.personId === hayden.id);
    if (optimistic === undefined) {
      throw new Error("Expected optimistic row");
    }
    const assignment = rosterAssignment(ids, position, optimistic);
    const declining = writer.setStatus(assignment, "declined");
    const confirming = writer.setStatus(assignment, "confirmed");
    const later = writer.adjust(position, "add");
    await assigning;
    try {
      await expect(Promise.all([declining, confirming])).resolves.toStrictEqual(
        [true, true]
      );
      const current =
        cache.getQueryData<TeamPositionGroup[]>(key)?.[0].positions[0];
      expect(
        current?.filledPeople?.filter((p) => p.personId === hayden.id)
      ).toMatchObject([{ planPersonId: saved.data.id, status: "confirmed" }]);
      expect(current).toMatchObject({
        filledConfirmedCount: (position.filledConfirmedCount ?? 0) + 1,
        filledPendingCount: position.filledPendingCount ?? 0,
        neededCount: position.neededCount,
      });
      expect(
        spy.mock.calls.filter(([name]) => name === "people.positionCandidates")
      ).toHaveLength(1);
      expect(
        spy.mock.calls.filter(([name]) => name === "schedule.updateStatus")
      ).toMatchObject([
        ["schedule.updateStatus", { planPersonId: saved.data.id, status: "D" }],
        ["schedule.updateStatus", { planPersonId: saved.data.id, status: "C" }],
      ]);
    } finally {
      gate.resolve(true);
      await later;
    }
  });
});

describe("Assign and Times share one roster journal", () => {
  const candidate = {
    id: "4100111",
    fullName: "Avery Woods",
    photoThumbnailUrl: null,
  };

  it.each(["confirmed", "declined", "remove"] as const)(
    "does not preserve a refused time membership through queued %s",
    async (action) => {
      const { transport, writer, cache, context, position, person } =
        await setup();
      const [time] = await cache.query(planReads.times(context, ids));
      const refusal = Promise.withResolvers<never>();
      const held = Promise.withResolvers<null>();
      const original = transport.handle.bind(transport);
      const call = vi.spyOn(transport, "handle");
      call.mockImplementationOnce(async () => await refusal.promise);
      call.mockImplementationOnce(async (tag, input, options) => {
        await held.promise;
        return await original(tag, input, options);
      });
      const timeWrite = writer.content.updateTime(
        {
          planTimeId: time.id,
          assignedPlanPersonIds: [person.planPersonId],
          timeType: "service",
        },
        time
      );
      const assignment = rosterAssignment(ids, position, person);
      const rosterWrite =
        action === "remove"
          ? writer.remove(assignment)
          : writer.setStatus(assignment, action);
      refusal.reject(new Error("time refused"));
      await expect(timeWrite).resolves.toBeFalsy();
      const whileHeld = cache
        .getQueryData<TeamPositionGroup[]>(
          planReads.groups(context, ids).queryKey
        )?.[0]
        .positions[0].filledPeople?.find((entry) => entry.id === person.id);
      expect(whileHeld?.assignedTimeIds).toStrictEqual(
        action === "confirmed" ? person.assignedTimeIds : undefined
      );
      held.resolve(null);
      await expect(rosterWrite).resolves.toBeTruthy();
      if (action === "declined") {
        await writer.setStatus(assignment, "confirmed");
      }
      const row = cache
        .getQueryData<TeamPositionGroup[]>(
          planReads.groups(context, ids).queryKey
        )?.[0]
        .positions[0].filledPeople?.find((entry) => entry.id === person.id);
      expect(action === "remove" ? row : row?.assignedTimeIds).toStrictEqual(
        action === "remove" ? undefined : person.assignedTimeIds
      );
    }
  );

  it("restores a decline with time membership acknowledged after its caller snapshot", async () => {
    const { transport, writer, cache, context, position, person } =
      await setup();
    const [time] = await cache.query(planReads.times(context, ids));
    const assignment = rosterAssignment(ids, position, person);
    const landed = Promise.withResolvers<null>();
    const statusHeld = Promise.withResolvers<null>();
    const original = transport.handle.bind(transport);
    const call = vi.spyOn(transport, "handle");
    call.mockImplementationOnce(async (tag, input, options) => {
      await landed.promise;
      return await original(tag, input, options);
    });
    call.mockImplementationOnce(async (tag, input, options) => {
      await statusHeld.promise;
      return await original(tag, input, options);
    });
    const timeWrite = writer.content.updateTime(
      {
        planTimeId: time.id,
        assignedPlanPersonIds: [person.planPersonId],
        timeType: "service",
      },
      time
    );
    const decline = writer.setStatus(assignment, "declined");
    landed.resolve(null);
    await timeWrite;
    statusHeld.resolve(null);
    await decline;
    await writer.setStatus(assignment, "confirmed");
    const row = cache
      .getQueryData<TeamPositionGroup[]>(
        planReads.groups(context, ids).queryKey
      )?.[0]
      .positions[0].filledPeople?.find((entry) => entry.id === person.id);
    expect(row?.assignedTimeIds).toContain(time.id);
    expect(row?.serviceTimeIds).toContain(time.id);
  });

  it("refreshes archived declined memberships when a later time clear lands", async () => {
    const { transport, writer, client, cache, context, position, person } =
      await setup();
    const [time] = await cache.query(planReads.times(context, ids));
    const assignment = rosterAssignment(ids, position, person);
    await writer.content.updateTime(
      {
        planTimeId: time.id,
        assignedPlanPersonIds: [person.planPersonId],
        timeType: "service",
      },
      time
    );
    await writer.setStatus(assignment, "declined");
    const held = Promise.withResolvers<null>();
    const original = transport.handle.bind(transport);
    vi.spyOn(transport, "handle").mockImplementationOnce(
      async (tag, input, options) => {
        await held.promise;
        return await original(tag, input, options);
      }
    );
    const clear = writer.content.updateTime(
      {
        planTimeId: time.id,
        clearedPlanPersonIds: [person.planPersonId],
        timeType: "service",
      },
      time
    );
    const restore = writer.setStatus(assignment, "confirmed");
    held.resolve(null);
    await Promise.all([clear, restore]);
    const row = cache
      .getQueryData<TeamPositionGroup[]>(
        planReads.groups(context, ids).queryKey
      )?.[0]
      .positions[0].filledPeople?.find((entry) => entry.id === person.id);
    expect(row?.assignedTimeIds).not.toContain(time.id);
    expect(row?.serviceTimeIds).not.toContain(time.id);
    const targetClientNative18 = client;
    const inputNative18 = ids;
    const fresh = await targetClientNative18.run((api) =>
      api.catalog.teamPositions({
        params: inputNative18,
        query: {},
      })
    );
    expect(
      fresh[0].positions[0].filledPeople?.find(
        (entry) => entry.id === person.id
      )?.assignedTimeIds
    ).not.toContain(time.id);
  });

  it("resolves provider AlreadyScheduled before a queued time membership sends", async () => {
    const { transport, writer, client, cache, context, position } =
      await setup();
    const [time] = await cache.query(planReads.times(context, ids));
    const targetClientNative19 = client;
    const inputNative19 = {
      ...ids,
      personId: candidate.id,
      teamId: position.teamId,
      positionId: position.id,
      teamName: "Band",
      positionName: position.name,
      oneOff: false,
    };
    const saved = await targetClientNative19.run((api) =>
      api.schedule.assign({ params: inputNative19, payload: inputNative19 })
    );
    const held = Promise.withResolvers<null>();
    const call = vi.spyOn(transport, "handle");
    call.mockImplementationOnce(async () => {
      await held.promise;
      throw new AlreadyScheduled({ message: "Already scheduled" });
    });
    const assigning = writer.assign(candidate, position, "Band", false);
    const pending = cache
      .getQueryData<TeamPositionGroup[]>(
        planReads.groups(context, ids).queryKey
      )?.[0]
      .positions[0].filledPeople?.find((row) => row.personId === candidate.id);
    if (pending === undefined) {
      throw new Error("Expected pending assignment");
    }
    const timeWrite = writer.content.updateTime(
      {
        planTimeId: time.id,
        assignedPlanPersonIds: [pending.planPersonId],
        timeType: "service",
      },
      time
    );
    held.resolve(null);
    await assigning;
    await expect(timeWrite).resolves.toBeTruthy();
    expect(
      call.mock.calls.find(([tag]) => tag === "planTimes.update")?.[1]
    ).toMatchObject({ assignedPlanPersonIds: [saved.data.id] });
    expect(
      call.mock.calls.filter(([tag]) => tag === "people.positionCandidates")
    ).toHaveLength(1);
  });

  it("never sends a time membership for a refused Assign placeholder", async () => {
    const { transport, writer, cache, context, position } = await setup();
    const [time] = await cache.query(planReads.times(context, ids));
    const refused = Promise.withResolvers<never>();
    const call = vi.spyOn(transport, "handle");
    call.mockImplementationOnce(async () => await refused.promise);
    const assigning = writer.assign(candidate, position, "Band", false);
    const pending = cache
      .getQueryData<TeamPositionGroup[]>(
        planReads.groups(context, ids).queryKey
      )?.[0]
      .positions[0].filledPeople?.find((row) => row.personId === candidate.id);
    if (pending === undefined) {
      throw new Error("Expected pending assignment");
    }
    const timeWrite = writer.content.updateTime(
      {
        planTimeId: time.id,
        assignedPlanPersonIds: [pending.planPersonId],
        timeType: "service",
      },
      time
    );
    refused.reject(new Error("Assign refused"));
    await assigning;
    await expect(timeWrite).resolves.toBeFalsy();
    expect(call.mock.calls.map(([tag]) => tag)).toStrictEqual([
      "schedule.assign",
    ]);
    expect(
      cache
        .getQueryData<TeamPositionGroup[]>(
          planReads.groups(context, ids).queryKey
        )?.[0]
        .positions[0].filledPeople?.some((row) => row.personId === candidate.id)
    ).toBeFalsy();
  });

  it("resolves a pending Assign ID before a queued time assignment sends", async () => {
    const { transport, writer, cache, context, position } = await setup();
    const [time] = await cache.query(planReads.times(context, ids));
    const held = Promise.withResolvers<null>();
    const original = transport.handle.bind(transport);
    const call = vi.spyOn(transport, "handle");
    call.mockImplementationOnce(async (tag, input, options) => {
      await held.promise;
      return await original(tag, input, options);
    });
    const assigning = writer.assign(candidate, position, "Band", false);
    const optimistic = cache
      .getQueryData<TeamPositionGroup[]>(
        planReads.groups(context, ids).queryKey
      )?.[0]
      .positions[0].filledPeople?.find((row) => row.personId === candidate.id);
    if (optimistic === undefined) {
      throw new Error("Expected pending assignment");
    }
    const timeWrite = writer.content.updateTime(
      {
        planTimeId: time.id,
        assignedPlanPersonIds: [optimistic.planPersonId],
        timeType: "service",
      },
      time
    );
    held.resolve(null);
    await assigning;
    await expect(timeWrite).resolves.toBeTruthy();
    const payload = call.mock.calls.find(
      ([tag]) => tag === "planTimes.update"
    )?.[1];
    expect(payload).toMatchObject({
      assignedPlanPersonIds: [expect.not.stringContaining("optimistic:")],
    });
    const row = cache
      .getQueryData<TeamPositionGroup[]>(
        planReads.groups(context, ids).queryKey
      )?.[0]
      .positions[0].filledPeople?.find(
        (entry) => entry.personId === candidate.id
      );
    expect(row?.assignedTimeIds).toContain(time.id);
    expect(row?.serviceTimeIds).toContain(time.id);
  });
});

const assignmentMembership = (person: FilledPositionPerson | undefined) => ({
  present: person !== undefined,
  id: person?.planPersonId ?? null,
  assigned: person?.assignedTimeIds ?? [],
  service: person?.serviceTimeIds ?? [],
});
const candidateAssignmentId = (
  candidates: CandidatesData | undefined,
  personId: string
): string | null =>
  candidates?.candidates.find((person) => person.id === personId)
    ?.selectedPlanSlot?.planPersonId ?? null;

describe("assignment incarnations across removal and retry", () => {
  it.each([
    { accepted: false, selected: "current" },
    { accepted: true, selected: "current" },
    { accepted: false, selected: "retired-placeholder" },
    { accepted: true, selected: "retired-placeholder" },
    { accepted: false, selected: "retired-saved" },
    { accepted: true, selected: "retired-saved" },
  ] as const)(
    "sends only the current saved incarnation: $selected, accepted $accepted",
    async ({ accepted, selected }) => {
      const { transport, writer, cache, context, position, onError } =
        await setup();
      const person = {
        id: "4100111",
        fullName: "Avery Woods",
        photoThumbnailUrl: null,
      };
      const groupsKey = planReads.groups(context, ids).queryKey;
      const row = () =>
        cache
          .getQueryData<TeamPositionGroup[]>(groupsKey)?.[0]
          .positions[0].filledPeople?.find(
            (candidate) => candidate.personId === person.id
          );
      const [time] = await cache.query(planReads.times(context, ids));
      const first = writer.assign(person, position, "Band", false);
      const firstPending = row();
      if (firstPending === undefined) {
        throw new Error("Expected first pending incarnation");
      }
      await first;
      const firstSaved = row();
      if (firstSaved === undefined) {
        throw new Error("Expected first saved incarnation");
      }
      await writer.remove(rosterAssignment(ids, position, firstSaved));
      const candidatesKey = assignReads.candidates(context, {
        ...ids,
        teamId: position.teamId,
        positionId: position.id,
        date: time.startsAt.toISOString(),
      }).queryKey;
      await cache.query(
        assignReads.candidates(context, {
          ...ids,
          teamId: position.teamId,
          positionId: position.id,
          date: time.startsAt.toISOString(),
        })
      );
      const hold = Promise.withResolvers<boolean>();
      const original = transport.handle.bind(transport);
      const sent = vi
        .spyOn(transport, "handle")
        .mockImplementation(async (tag, input, options) => {
          if (tag === "schedule.assign" && !(await hold.promise)) {
            throw new Error("Retry refused");
          }
          return await original(tag, input, options);
        });
      const retry = writer.assign(person, position, "Band", false);
      const pending = row();
      if (pending === undefined) {
        throw new Error("Expected retry pending incarnation");
      }
      expect(pending.planPersonId).not.toBe(firstPending.planPersonId);
      const selectedId = {
        current: pending.planPersonId,
        "retired-placeholder": firstPending.planPersonId,
        "retired-saved": firstSaved.planPersonId,
      }[selected];
      const edit = writer.content.updateTime(
        {
          planTimeId: time.id,
          timeType: "service",
          assignedPlanPersonIds: [selectedId],
        },
        time
      );
      expect(row()?.assignedTimeIds ?? []).toStrictEqual(
        selected === "current" ? [time.id] : []
      );
      hold.resolve(accepted);
      await retry;
      const currentSaved = row();
      const expectedSave = accepted && selected === "current";
      await expect(edit).resolves.toBe(expectedSave);
      const timeRequests = sent.mock.calls.filter(
        ([tag]) => tag === "planTimes.update"
      );
      const membership = assignmentMembership(row());
      const savedId = assignmentMembership(currentSaved).id;
      expect({
        timeRequestIds: timeRequests.map(
          ([, input]) => input.assignedPlanPersonIds
        ),
        distinctSavedId: savedId !== firstSaved.planPersonId,
        membership,
        errors: onError.mock.calls.length,
        candidateId: candidateAssignmentId(
          cache.getQueryData<CandidatesData>(candidatesKey),
          person.id
        ),
      }).toStrictEqual({
        timeRequestIds: expectedSave ? [[savedId]] : [],
        distinctSavedId: true,
        membership: {
          present: accepted,
          id: savedId,
          assigned: expectedSave ? [time.id] : [],
          service: expectedSave ? [time.id] : [],
        },
        errors: accepted ? 0 : 1,
        candidateId: accepted ? savedId : null,
      });
    }
  );
});
