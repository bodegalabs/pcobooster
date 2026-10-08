import { makeProductClient } from "@pcobooster/client/product-client";
import { procedureRoutes } from "@pcobooster/contracts/http/api";
import { matchRoute } from "@pcobooster/contracts/http/route";
import { buildEditablePlanTime } from "@pcobooster/planning-center-models/plan-time-edits";
import type { TeamPositionGroup } from "@pcobooster/planning-center-models/types";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { makeFixtureFetch } from "../../../harness/fixture-transport";
import { rosterAssignment } from "../assignment";
import { planReads } from "../reads";
import { PlanWriter } from "../writes";
import { TimeEditSession } from "./time-session";

const ids = { serviceTypeId: "1101", planId: "881261004" };
const zone = "America/Los_Angeles";

interface Held {
  accept: () => void;
  refuse: () => void;
}

const setup = async (failTag?: string, holdUpdates = false) => {
  const fixture = makeFixtureFetch({ latencyMs: 0 });
  const calls: string[] = [];
  const held: Held[] = [];
  const client = makeProductClient({
    url: "https://fixture.invalid",
    client: "expo",
    credentials: "omit",
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const match = matchRoute(
        procedureRoutes,
        request.method,
        new URL(request.url).pathname
      );
      if (match.kind !== "found") {
        throw new Error("Unexpected endpoint");
      }
      const { tag } = match.route;
      calls.push(tag);
      if (tag === failTag) {
        throw new Error("Refused fixture write");
      }
      if (holdUpdates && tag === "planTimes.update") {
        const outcome = Promise.withResolvers<boolean>();
        held.push({
          accept: () => {
            outcome.resolve(true);
          },
          refuse: () => {
            outcome.resolve(false);
          },
        });
        if (!(await outcome.promise)) {
          throw new Error("Refused fixture write");
        }
      }
      return await fixture(input, init);
    },
  });
  const cache = new QueryClient();
  const context = { client, scope: "time-session-test" };
  const [time] = await cache.query(planReads.times(context, ids));
  const groups = await cache.query(planReads.groups(context, ids));
  const writer = new PlanWriter(
    client,
    cache,
    context.scope,
    ids,
    vi.fn<(error: Error) => void>(),
    vi.fn<() => void>()
  );
  const { content } = writer;
  const editing = (editable = true) =>
    new TimeEditSession({
      writer: content,
      zone,
      time,
      draft: buildEditablePlanTime(time, zone, groups),
      groups,
      editable,
    });
  const updates = () => calls.filter((tag) => tag === "planTimes.update");
  /** Settles the nth held update once it has been sent. */
  const settle = async (index: number, outcome: keyof Held) => {
    await vi.waitFor(() => {
      expect(held.length).toBeGreaterThan(index);
    });
    held[index]?.[outcome]();
  };
  const savedName = async () => {
    const targetClientNative1 = client;
    const inputNative1 = ids;
    const saved = await targetClientNative1.run((api) =>
      api.planTimes.list({ params: inputNative1 })
    );
    return saved.find((value) => value.id === time.id)?.name;
  };
  return {
    client,
    cache,
    writer,
    context,
    time,
    groups,
    editing,
    updates,
    content,
    settle,
    savedName,
  };
};

describe("time edit sessions", () => {
  it("keeps an untouched form unchanged when its initial roster arrives", async () => {
    const { content, time, groups, updates, client } = await setup();
    const session = new TimeEditSession({
      writer: content,
      zone,
      time,
      draft: buildEditablePlanTime(time, zone),
      groups: undefined,
      editable: true,
    });
    session.rosterLoaded(groups);
    const { changed, draft } = session;
    session.leave();
    await vi.waitFor(async () => {
      const saved = buildEditablePlanTime(
        time,
        zone,
        await (async () => {
          const targetClient = client;
          const input = ids;
          return await targetClient.run((api) =>
            api.catalog.teamPositions({
              params: input,
              query: {},
            })
          );
        })()
      );
      expect(saved.assignedPlanPersonIds).toStrictEqual(
        buildEditablePlanTime(time, zone, groups).assignedPlanPersonIds
      );
    });
    expect(changed).toBeFalsy();
    expect(draft.assignedPlanPersonIds).toStrictEqual(
      buildEditablePlanTime(time, zone, groups).assignedPlanPersonIds
    );
    expect(updates()).toHaveLength(0);
  });

  it("initializes assignments in a scalar draft queued before the roster arrives", async () => {
    const { content, time, groups, updates, settle, client } = await setup(
      undefined,
      true
    );
    const blocking = content.updateTime(
      { planTimeId: time.id, name: time.name },
      time
    );
    const session = new TimeEditSession({
      writer: content,
      zone,
      time,
      draft: buildEditablePlanTime(time, zone),
      groups: undefined,
      editable: true,
    });
    session.change({ ...session.draft, name: "Later roster" });
    const saving = session.save();
    session.rosterLoaded(groups);
    await settle(0, "accept");
    await settle(1, "accept");
    await Promise.all([blocking, saving]);
    const saved = buildEditablePlanTime(
      time,
      zone,
      await (async () => {
        const targetClient = client;
        const input = ids;
        return await targetClient.run((api) =>
          api.catalog.teamPositions({
            params: input,
            query: {},
          })
        );
      })()
    );
    expect(saved.assignedPlanPersonIds).toStrictEqual(
      buildEditablePlanTime(time, zone, groups).assignedPlanPersonIds
    );
    expect(updates()).toHaveLength(2);
  });

  it.each([
    ["people", false],
    ["people", true],
    ["needed slots", false],
    ["needed slots", true],
  ])(
    "reopens with %s facts before reconciliation, pending %s",
    async (kind, pending) => {
      const { editing, client, time, groups, settle } = await setup(
        undefined,
        pending
      );
      const original = editing();
      const field =
        kind === "people"
          ? "assignedPlanPersonIds"
          : "assignedNeededPositionIds";
      const positions = groups.flatMap((group) => group.positions);
      const id =
        kind === "people"
          ? positions
              .flatMap((position) => position.filledPeople ?? [])
              .find(
                (person) => !original.draft[field].includes(person.planPersonId)
              )?.planPersonId
          : positions.find(
              (position) =>
                position.neededPositionId !== undefined &&
                !original.draft[field].includes(position.neededPositionId)
            )?.neededPositionId;
      if (id === undefined) {
        throw new Error("Unassigned fixture record required");
      }
      original.change({
        ...original.draft,
        [field]: [...original.draft[field], id],
      });
      const first = original.save();
      original.leave();
      if (!pending) {
        await first;
      }
      const reopened = editing();
      expect(reopened.draft[field]).toContain(id);
      reopened.change({
        ...reopened.draft,
        [field]: reopened.draft[field].filter((value) => value !== id),
        name: "Reopened clear",
      });
      const last = reopened.save();
      if (pending) {
        await settle(0, "accept");
        await settle(1, "accept");
      }
      await Promise.all([first, last]);
      const saved = buildEditablePlanTime(
        time,
        zone,
        await (async () => {
          const targetClient = client;
          const input = ids;
          return await targetClient.run((api) =>
            api.catalog.teamPositions({
              params: input,
              query: {},
            })
          );
        })()
      );
      expect(saved[field]).not.toContain(id);
    }
  );

  it("accepts fresh roster facts into untouched fields while preserving a scalar draft", async () => {
    const { editing, client, time, groups } = await setup();
    const session = editing();
    session.change({ ...session.draft, name: "Keep my name" });
    const person = groups
      .flatMap((group) => group.positions)
      .flatMap((position) => position.filledPeople ?? [])
      .find(
        (candidate) =>
          !session.draft.assignedPlanPersonIds.includes(candidate.planPersonId)
      )?.planPersonId;
    if (person === undefined) {
      throw new Error("Unassigned person required");
    }
    const targetClientNative2 = client;
    const inputNative2 = {
      ...ids,
      planTimeId: time.id,
      assignedPlanPersonIds: [person],
    };
    await targetClientNative2.run((api) =>
      api.planTimes.update({ params: inputNative2, payload: inputNative2 })
    );
    const targetClientNative3 = client;
    const inputNative3 = ids;
    const fresh = await targetClientNative3.run((api) =>
      api.catalog.teamPositions({
        params: inputNative3,
        query: {},
      })
    );
    session.rosterLoaded(fresh);
    expect(session.draft.name).toBe("Keep my name");
    expect(session.draft.assignedPlanPersonIds).toStrictEqual(
      buildEditablePlanTime(time, zone, fresh).assignedPlanPersonIds
    );
    expect(session.changed).toBeTruthy();
  });

  it("synchronizes a saved assignment after a later authoritative roster change", async () => {
    const { editing, client, time, groups } = await setup();
    const session = editing();
    const person = groups
      .flatMap((group) => group.positions)
      .flatMap((position) => position.filledPeople ?? [])
      .find(
        (candidate) =>
          !session.draft.assignedPlanPersonIds.includes(candidate.planPersonId)
      );
    if (person === undefined) {
      throw new Error("Unassigned person required");
    }
    session.change({
      ...session.draft,
      assignedPlanPersonIds: [
        ...session.draft.assignedPlanPersonIds,
        person.planPersonId,
      ],
    });
    await session.save();
    const targetClientNative4 = client;
    const inputNative4 = {
      ...ids,
      planTimeId: time.id,
      clearedPlanPersonIds: [person.planPersonId],
    };
    await targetClientNative4.run((api) =>
      api.planTimes.update({ params: inputNative4, payload: inputNative4 })
    );
    session.rosterLoaded(
      await (async () => {
        const targetClient = client;
        const input = ids;
        return await targetClient.run((api) =>
          api.catalog.teamPositions({
            params: input,
            query: {},
          })
        );
      })()
    );
    expect(session.draft.assignedPlanPersonIds).not.toContain(
      person.planPersonId
    );
    expect(session.changed).toBeFalsy();
  });

  it("preserves touched assignment fields when a fresh roster arrives", async () => {
    const { editing, client, time, groups } = await setup();
    const session = editing();
    const person = groups
      .flatMap((group) => group.positions)
      .flatMap((position) => position.filledPeople ?? [])
      .find(
        (candidate) =>
          !session.draft.assignedPlanPersonIds.includes(candidate.planPersonId)
      );
    if (person === undefined) {
      throw new Error("Unassigned person required");
    }
    session.change({
      ...session.draft,
      assignedPlanPersonIds: [
        ...session.draft.assignedPlanPersonIds,
        person.planPersonId,
      ],
    });
    const draft = session.draft.assignedPlanPersonIds;
    session.rosterLoaded(
      await (async () => {
        const targetClient = client;
        const input = ids;
        return await targetClient.run((api) =>
          api.catalog.teamPositions({
            params: input,
            query: {},
          })
        );
      })()
    );
    expect(session.draft.assignedPlanPersonIds).toBe(draft);
    await session.save();
    expect(
      buildEditablePlanTime(
        time,
        zone,
        await (async () => {
          const targetClient = client;
          const input = ids;
          return await targetClient.run((api) =>
            api.catalog.teamPositions({
              params: input,
              query: {},
            })
          );
        })()
      ).assignedPlanPersonIds
    ).toContain(person.planPersonId);
  });

  it("rolls back a refused assignment in a reopened untouched form", async () => {
    const { editing, groups, time, cache, context, settle } = await setup(
      undefined,
      true
    );
    const session = editing();
    const person = groups
      .flatMap((group) => group.positions)
      .flatMap((position) => position.filledPeople ?? [])
      .find(
        (candidate) =>
          !session.draft.assignedPlanPersonIds.includes(candidate.planPersonId)
      );
    if (person === undefined) {
      throw new Error("Unassigned person required");
    }
    session.change({
      ...session.draft,
      assignedPlanPersonIds: [
        ...session.draft.assignedPlanPersonIds,
        person.planPersonId,
      ],
    });
    const saving = session.save();
    const reopened = editing();
    expect(reopened.draft.assignedPlanPersonIds).toContain(person.planPersonId);
    await settle(0, "refuse");
    await saving;
    reopened.rosterLoaded(
      cache.getQueryData(planReads.groups(context, ids).queryKey)
    );
    expect(reopened.draft.assignedPlanPersonIds).toStrictEqual(
      buildEditablePlanTime(time, zone, groups).assignedPlanPersonIds
    );
    expect(reopened.changed).toBeFalsy();
  });

  it("does not send a later pending assignment in an earlier scalar save", async () => {
    const { editing, groups, time, settle, client, savedName } = await setup(
      undefined,
      true
    );
    const first = editing();
    first.change({ ...first.draft, name: "Scalar first" });
    const scalar = first.save();
    const later = editing();
    const person = groups
      .flatMap((group) => group.positions)
      .flatMap((position) => position.filledPeople ?? [])
      .find(
        (candidate) =>
          !later.draft.assignedPlanPersonIds.includes(candidate.planPersonId)
      );
    if (person === undefined) {
      throw new Error("Unassigned person required");
    }
    later.change({
      ...later.draft,
      assignedPlanPersonIds: [
        ...later.draft.assignedPlanPersonIds,
        person.planPersonId,
      ],
    });
    const assignment = later.save();
    await settle(0, "accept");
    await settle(1, "refuse");
    await Promise.all([scalar, assignment]);
    expect(
      buildEditablePlanTime(
        time,
        zone,
        await (async () => {
          const targetClient = client;
          const input = ids;
          return await targetClient.run((api) =>
            api.catalog.teamPositions({
              params: input,
              query: {},
            })
          );
        })()
      ).assignedPlanPersonIds
    ).not.toContain(person.planPersonId);
    await expect(savedName()).resolves.toBe("Scalar first");
  });

  it("rebases a queued roster status write over a refused time assignment", async () => {
    const { editing, groups, settle, writer, client } = await setup(
      undefined,
      true
    );
    const session = editing();
    const person = groups
      .flatMap((group) => group.positions)
      .flatMap((position) => position.filledPeople ?? [])
      .find(
        (candidate) =>
          !session.draft.assignedPlanPersonIds.includes(candidate.planPersonId)
      );
    if (person === undefined) {
      throw new Error("Unassigned person required");
    }
    session.change({
      ...session.draft,
      assignedPlanPersonIds: [
        ...session.draft.assignedPlanPersonIds,
        person.planPersonId,
      ],
    });
    const assignment = session.save();
    const selectedPosition = groups
      .flatMap((group) => group.positions)
      .find((slot) => slot.filledPeople?.includes(person) === true);
    if (selectedPosition === undefined) {
      throw new Error("Position required");
    }
    const status = writer.setStatus(
      rosterAssignment(ids, selectedPosition, person),
      "confirmed"
    );
    await settle(0, "refuse");
    await Promise.all([assignment, status]);
    const targetClientNative5 = client;
    const inputNative5 = ids;
    const fresh = await targetClientNative5.run((api) =>
      api.catalog.teamPositions({
        params: inputNative5,
        query: {},
      })
    );
    expect(
      fresh
        .flatMap((group) => group.positions)
        .flatMap((position) => position.filledPeople ?? [])
        .find((candidate) => candidate.planPersonId === person.planPersonId)
        ?.status
    ).toBe("confirmed");
    expect(editing().draft.assignedPlanPersonIds).not.toContain(
      person.planPersonId
    );
  });

  it("initializes a genuinely absent roster while a scalar save is queued", async () => {
    const { content, time, groups, cache, context, settle, client } =
      await setup(undefined, true);
    cache.removeQueries({
      queryKey: planReads.groups(context, ids).queryKey,
      exact: true,
    });
    const session = new TimeEditSession({
      writer: content,
      time,
      zone,
      groups: undefined,
      draft: buildEditablePlanTime(time, zone),
      editable: true,
    });
    session.change({ ...session.draft, name: "Late initial roster" });
    const saving = session.save();
    session.rosterLoaded(groups);
    await settle(0, "accept");
    await saving;
    expect(session.draft.assignedPlanPersonIds).toStrictEqual(
      buildEditablePlanTime(time, zone, groups).assignedPlanPersonIds
    );
    expect(
      buildEditablePlanTime(
        time,
        zone,
        await (async () => {
          const targetClient = client;
          const input = ids;
          return await targetClient.run((api) =>
            api.catalog.teamPositions({
              params: input,
              query: {},
            })
          );
        })()
      ).assignedPlanPersonIds
    ).toStrictEqual(
      buildEditablePlanTime(time, zone, groups).assignedPlanPersonIds
    );
  });

  it("keeps service-time membership in step with the shared roster cache", async () => {
    const { content, time, groups, cache, context } = await setup();
    const person = groups
      .flatMap((group) => group.positions)
      .flatMap((position) => position.filledPeople ?? [])
      .find(
        (candidate) => candidate.assignedTimeIds?.includes(time.id) !== true
      );
    if (person === undefined) {
      throw new Error("Unassigned person required");
    }
    const service = { ...time, timeType: "service" as const };
    const cachedPerson = () =>
      cache
        .getQueryData<TeamPositionGroup[]>(
          planReads.groups(context, ids).queryKey
        )
        ?.flatMap((group) => group.positions)
        .flatMap((position) => position.filledPeople ?? [])
        .find((candidate) => candidate.planPersonId === person.planPersonId);
    await content.updateTime(
      {
        planTimeId: time.id,
        timeType: "service",
        assignedPlanPersonIds: [person.planPersonId],
      },
      service
    );
    expect(cachedPerson()?.serviceTimeIds).toContain(time.id);
    await content.updateTime(
      { planTimeId: time.id, clearedPlanPersonIds: [person.planPersonId] },
      service
    );
    expect(cachedPerson()?.serviceTimeIds).not.toContain(time.id);
  });

  it("sends a change saved in the background once, not again on close", async () => {
    const { editing, updates, client, time } = await setup();
    const session = editing();
    session.change({ ...session.draft, name: "Band call" });
    await session.save();
    session.leave();
    await session.save();
    const targetClientNative6 = client;
    const inputNative6 = ids;
    const saved = await targetClientNative6.run((api) =>
      api.planTimes.list({ params: inputNative6 })
    );
    expect(saved.find((value) => value.id === time.id)?.name).toBe("Band call");
    expect(updates()).toHaveLength(1);
  });

  it("sends a later change against what was already saved", async () => {
    const { editing, updates, client, time } = await setup();
    const session = editing();
    session.change({ ...session.draft, name: "Band call" });
    await session.save();
    session.change({ ...session.draft, name: "Soundcheck" });
    session.leave();
    await vi.waitFor(() => {
      expect(updates()).toHaveLength(2);
    });
    const targetClientNative7 = client;
    const inputNative7 = ids;
    const saved = await targetClientNative7.run((api) =>
      api.planTimes.list({ params: inputNative7 })
    );
    expect(saved.find((value) => value.id === time.id)?.name).toBe(
      "Soundcheck"
    );
    expect(updates()).toHaveLength(2);
  });

  it("saves a revert made while a save is pending, so the final value wins", async () => {
    const { editing, updates, settle, savedName, time } = await setup(
      undefined,
      true
    );
    const session = editing();
    const original = session.draft;
    session.change({ ...original, name: "Band call" });
    const pending = session.save();
    session.change(original);
    const { changed } = session;
    session.leave();
    await settle(0, "accept");
    await settle(1, "accept");
    await pending;
    await vi.waitFor(async () => {
      await expect(savedName()).resolves.toBe(time.name);
    });
    expect({ changed, updates: updates().length }).toStrictEqual({
      changed: true,
      updates: 2,
    });
  });

  it("keeps a closed time editor's final save ahead of a reopened editor", async () => {
    const { editing, settle, savedName, updates } = await setup(
      undefined,
      true
    );
    const old = editing();
    old.change({ ...old.draft, name: "A" });
    const background = old.save();
    await vi.waitFor(() => {
      expect(updates()).toHaveLength(1);
    });
    old.change({ ...old.draft, name: "B" });
    old.leave();
    const reopened = editing();
    reopened.change({ ...reopened.draft, name: "C" });
    const newest = reopened.save();
    await settle(0, "accept");
    await settle(1, "accept");
    await vi.waitFor(() => {
      expect(updates()).toHaveLength(3);
    });
    const middle = await savedName();
    await settle(2, "accept");
    await Promise.all([background, newest]);
    await vi.waitFor(async () => {
      await expect(savedName()).resolves.toBe("C");
    });
    expect(middle).toBe("B");
    expect(updates()).toHaveLength(3);
  });

  it.each([
    ["people", false],
    ["people", true],
    ["needed slots", false],
    ["needed slots", true],
  ])(
    "clears a pending %s assignment on close with scalar change %s",
    async (kind, scalar) => {
      const { editing, groups, time, client, settle, updates, savedName } =
        await setup(undefined, true);
      const original = buildEditablePlanTime(time, zone, groups);
      const positions = groups.flatMap((group) => group.positions);
      const field =
        kind === "people"
          ? "assignedPlanPersonIds"
          : "assignedNeededPositionIds";
      const id =
        kind === "people"
          ? positions
              .flatMap((position) => position.filledPeople ?? [])
              .find(
                (person) =>
                  !original.assignedPlanPersonIds.includes(person.planPersonId)
              )?.planPersonId
          : positions.find(
              (position) =>
                position.neededPositionId !== undefined &&
                !original.assignedNeededPositionIds.includes(
                  position.neededPositionId
                )
            )?.neededPositionId;
      if (id === undefined) {
        throw new Error("An unassigned fixture record is required");
      }
      const session = editing();
      session.change({ ...original, [field]: [...original[field], id] });
      const background = session.save();
      await vi.waitFor(() => {
        expect(updates()).toHaveLength(1);
      });
      session.change({
        ...original,
        name: scalar ? "Reverted assignment" : original.name,
      });
      session.leave();
      await settle(0, "accept");
      await settle(1, "accept");
      await background;
      await vi.waitFor(async () => {
        const saved = buildEditablePlanTime(
          time,
          zone,
          await (async () => {
            const targetClient = client;
            const input = ids;
            return await targetClient.run((api) =>
              api.catalog.teamPositions({
                params: input,
                query: {},
              })
            );
          })()
        );
        expect(saved[field]).toStrictEqual(original[field]);
      });
      await expect(savedName()).resolves.toBe(
        scalar ? "Reverted assignment" : original.name
      );
      expect(updates()).toHaveLength(2);
    }
  );

  it.each(["people", "needed slots"])(
    "retries refused %s assignments with a scalar edit",
    async (kind) => {
      const { editing, groups, time, client, settle, savedName, updates } =
        await setup(undefined, true);
      const session = editing();
      const positions = groups.flatMap((group) => group.positions);
      const field =
        kind === "people"
          ? "assignedPlanPersonIds"
          : "assignedNeededPositionIds";
      const id =
        kind === "people"
          ? positions
              .flatMap((position) => position.filledPeople ?? [])
              .find(
                (person) => !session.draft[field].includes(person.planPersonId)
              )?.planPersonId
          : positions.find(
              (position) =>
                position.neededPositionId !== undefined &&
                !session.draft[field].includes(position.neededPositionId)
            )?.neededPositionId;
      if (id === undefined) {
        throw new Error("An unassigned fixture record is required");
      }
      session.change({
        ...session.draft,
        [field]: [...session.draft[field], id],
      });
      const background = session.save();
      await settle(0, "refuse");
      await expect(background).resolves.toBeFalsy();
      // A stale roster refresh cannot replace the session's acknowledged assignments.
      session.rosterLoaded(groups);
      session.change({ ...session.draft, name: "Retry assignment" });
      session.leave();
      await settle(1, "accept");
      await vi.waitFor(async () => {
        const saved = buildEditablePlanTime(
          time,
          zone,
          await (async () => {
            const targetClient = client;
            const input = ids;
            return await targetClient.run((api) =>
              api.catalog.teamPositions({
                params: input,
                query: {},
              })
            );
          })()
        );
        expect(saved[field]).toContain(id);
        await expect(savedName()).resolves.toBe("Retry assignment");
      });
      expect(updates()).toHaveLength(2);
    }
  );

  it("sends the first value again after two overlapping saves both fail", async () => {
    const { editing, updates, settle, savedName } = await setup(
      undefined,
      true
    );
    const session = editing();
    session.change({ ...session.draft, name: "Band call" });
    void session.save();
    session.change({ ...session.draft, name: "Soundcheck" });
    void session.save();
    await settle(0, "refuse");
    const overlapping = updates().length;
    await settle(1, "refuse");
    await vi.waitFor(() => {
      expect(session.changed).toBeTruthy();
    });
    session.change({ ...session.draft, name: "Band call" });
    session.leave();
    await settle(2, "accept");
    await vi.waitFor(async () => {
      await expect(savedName()).resolves.toBe("Band call");
    });
    expect({ overlapping, updates: updates().length }).toStrictEqual({
      overlapping: 1,
      updates: 3,
    });
  });

  it("retries a failed save once when the form closes unchanged", async () => {
    const { editing, updates, settle, savedName } = await setup(
      undefined,
      true
    );
    const session = editing();
    session.change({ ...session.draft, name: "Band call" });
    const failed = session.save();
    await settle(0, "refuse");
    const landed = await failed;
    const { changed } = session;
    session.leave();
    await settle(1, "accept");
    await vi.waitFor(async () => {
      await expect(savedName()).resolves.toBe("Band call");
    });
    expect({ landed, changed, updates: updates().length }).toStrictEqual({
      landed: false,
      changed: true,
      updates: 2,
    });
  });

  it("sends an edit still in flight once when the form closes", async () => {
    const { editing, updates, settle, savedName } = await setup(
      undefined,
      true
    );
    const session = editing();
    session.change({ ...session.draft, name: "Band call" });
    const saving = session.save();
    const { changed } = session;
    session.leave();
    await settle(0, "accept");
    await saving;
    expect({
      changed,
      name: await savedName(),
      updates: updates().length,
    }).toStrictEqual({ changed: false, name: "Band call", updates: 1 });
  });

  it("holds swipe dismissal only while closing would refuse or lose something", async () => {
    const { editing, content, time, groups } = await setup();
    const edit = editing();
    const readOnly = editing(false);
    const created = new TimeEditSession({
      writer: content,
      zone,
      time: undefined,
      draft: buildEditablePlanTime(time, zone, []),
      groups,
      editable: true,
    });
    const before = [edit.holdsDismiss, created.holdsDismiss];
    edit.change({ ...edit.draft, name: "Band call" });
    created.change({ ...created.draft, name: "Band call" });
    const changed = [edit.holdsDismiss, created.holdsDismiss];
    edit.change({ ...edit.draft, name: " " });
    readOnly.change({ ...readOnly.draft, name: " " });
    expect([
      ...before,
      ...changed,
      edit.holdsDismiss,
      readOnly.holdsDismiss,
    ]).toStrictEqual([false, false, false, true, true, false]);
  });

  it("closes a new time once Planning Center has it, even when its assignments fail", async () => {
    const { content, time, groups } = await setup("planTimes.update");
    const person = groups
      .flatMap((group) => group.positions)
      .flatMap((position) => position.filledPeople ?? [])
      .at(0);
    if (person === undefined) {
      throw new Error("A fixture person is required");
    }
    const draft = buildEditablePlanTime(time, zone, []);
    const created = new TimeEditSession({
      writer: content,
      zone,
      time: undefined,
      draft: {
        ...draft,
        name: "Soundcheck",
        assignedPlanPersonIds: [person.planPersonId],
      },
      groups,
      editable: true,
    });
    await expect(created.create()).resolves.toBeTruthy();
  });
});
