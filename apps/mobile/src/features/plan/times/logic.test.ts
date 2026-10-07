import { makeProductClient } from "@pcobooster/client/product-client";
import type { PlanTime } from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

import { makeFixtureFetch } from "../../../harness/fixture-transport";
import {
  draftInstant,
  durationLabel,
  emptyPlanStart,
  endClock,
  kindLabel,
  moveTimeStart,
  newTimeDraft,
  timeDays,
  timeDraftChanged,
  rowAssignments,
  peopleAtTime,
  previewNames,
  timeKindLine,
  timeRangeLabel,
  timeTitle,
  toggleId,
  validateTimeDraft,
} from "./logic";
import { dayTimeline } from "./timeline";

const zone = "America/Los_Angeles";
const time = (id: string, start: string, end: string | null): PlanTime => ({
  id,
  name: "Rehearsal",
  timeType: "rehearsal",
  startsAt: new Date(start),
  endsAt: end === null ? null : new Date(end),
  assignedTeamIds: [],
  assignedPositionIds: [],
  teamReminders: [],
  splitTeamRehearsalAssignmentIds: [],
});

describe("plan time rules", () => {
  it("labels a time's range in the org zone for its preview", () => {
    expect([
      timeRangeLabel(
        time("a", "2026-10-05T03:00:00Z", "2026-10-05T04:30:00Z"),
        zone
      ),
      timeRangeLabel(time("b", "2026-10-05T03:00:00Z", null), zone),
      timeRangeLabel(
        time("c", "2026-10-05T03:00:00Z", "2026-10-05T08:00:00Z"),
        zone
      ),
    ]).toStrictEqual([
      "Sun, Oct 4 · 8:00 PM - 9:30 PM",
      "Sun, Oct 4 · 8:00 PM",
      "Sun, Oct 4 8:00 PM - Mon, Oct 5 1:00 AM",
    ]);
  });

  it("names the people at a time, then how many more", () => {
    const names = ["Ana", "Ben", "Cy", "Di", "Ed", "Flo", "Gus", "Hal"];
    expect([
      previewNames(names.slice(0, 1)),
      previewNames(names.slice(0, 3)),
      previewNames(names),
    ]).toStrictEqual([
      "Ana",
      "Ana, Ben, and Cy",
      "Ana, Ben, Cy, Di, Ed, Flo, and 2 more",
    ]);
  });

  it("groups and labels congregation days across UTC midnight", () => {
    const late = time("late", "2026-10-05T03:00:00Z", "2026-10-05T04:30:00Z");
    expect(
      timeDays([late], zone, new Date("2026-10-04T18:00:00Z"))
    ).toMatchObject([{ key: "2026-10-04", relative: "Today" }]);
    expect(
      timeDays([late], zone, new Date("2026-10-05T18:00:00Z"))[0].relative
    ).toBe("Yesterday");
    expect(timeKindLine(late)).toBe("1h 30m");
    expect(endClock(late, zone)).toBe("9:30 PM");
  });

  it("formats point times, durations, and untitled kinds", () => {
    const point = time("point", "2026-10-04T16:00:00Z", null);
    expect({
      title: timeTitle({ ...point, name: " " }),
      duration: durationLabel(300),
    }).toStrictEqual({ title: "Rehearsal", duration: "5m" });
    expect([kindLabel("service"), kindLabel("other")]).toStrictEqual([
      "Service",
      "Other",
    ]);
    expect([
      timeKindLine(point),
      timeKindLine({ ...point, id: "pending-time-1" }),
    ]).toStrictEqual(["No end time", "Adding"]);
    expect(endClock(point, zone)).toBeNull();
    expect([toggleId(["a"], "a"), toggleId(["a"], "b")]).toStrictEqual([
      [],
      ["a", "b"],
    ]);
  });

  it("carries duration when moving a start through an org-day boundary", () => {
    const source = time("a", "2026-10-04T16:00:00Z", "2026-10-04T17:30:00Z");
    const draft = newTimeDraft([source], zone, null, source.startsAt);
    const moved = moveTimeStart(draft, new Date("2026-10-05T06:30:00Z"), zone);
    expect(moved).toMatchObject({
      startDate: "2026-10-04",
      startTime: "23:30",
      endDate: "2026-10-05",
      endTime: "01:00",
    });
    expect(draftInstant(moved, "end", zone).toISOString()).toBe(
      "2026-10-05T08:00:00.000Z"
    );
    expect(validateTimeDraft(moved, zone)).toBeNull();
    expect(validateTimeDraft({ ...moved, name: "" }, zone)).toBe(
      "Time name is required."
    );
    expect(
      validateTimeDraft(
        { ...moved, endDate: moved.startDate, endTime: "22:00" },
        zone
      )
    ).toBe("End time must be after start time.");
  });

  it("uses the fixed clock on an empty plan and keeps timed plan dates", () => {
    const now = new Date("2026-10-04T19:45:00Z");
    const midnight = new Date("2026-10-11T07:00:00Z");
    expect(emptyPlanStart(midnight, now, zone).toISOString()).toBe(
      "2026-10-11T19:45:00.000Z"
    );
    expect(emptyPlanStart(null, now, zone)).toBe(now);
    expect(emptyPlanStart(now, midnight, zone)).toBe(now);
    expect(newTimeDraft([], zone, midnight, now)).toMatchObject({
      startDate: "2026-10-11",
      startTime: "12:45",
    });
  });

  it("lays out overlap lanes, full-reach gaps, and point times", () => {
    const layout = dayTimeline(
      [
        time("a", "2026-10-04T16:00:00Z", "2026-10-04T18:00:00Z"),
        time("b", "2026-10-04T16:30:00Z", "2026-10-04T17:00:00Z"),
        time("c", "2026-10-04T18:30:00Z", null),
      ],
      zone
    );
    expect({
      laneCount: layout.laneCount,
      lanes: layout.blocks.map((block) => block.lane),
    }).toStrictEqual({ laneCount: 2, lanes: [0, 1, 0] });
    expect(layout.gaps.map((gap) => gap.seconds)).toStrictEqual([1800]);
    expect(layout.ticks[0].label).toBe("9 AM");
    expect(layout.blocks[2].end - layout.blocks[2].start).toBeCloseTo(1 / 12);
    expect(dayTimeline([], zone)).toStrictEqual({
      blocks: [],
      gaps: [],
      ticks: [],
      laneCount: 1,
    });
  });

  it("compares time drafts by fields and membership regardless of picker order", () => {
    const draft = newTimeDraft(
      [],
      zone,
      null,
      new Date("2026-10-01T19:45:00Z")
    );
    const before = { ...draft, assignedTeamIds: ["a", "b"] };
    expect(
      timeDraftChanged(before, { ...before, assignedTeamIds: ["b", "a"] })
    ).toBeFalsy();
    expect(
      timeDraftChanged(before, { ...before, assignedTeamIds: ["a"] })
    ).toBeTruthy();
    expect(
      timeDraftChanged(before, { ...before, name: "Changed" })
    ).toBeTruthy();
  });

  it("summarizes roster assignments and deduplicates people across positions", async () => {
    const client = makeProductClient({
      url: "https://fixture.invalid",
      client: "expo",
      credentials: "omit",
      fetch: makeFixtureFetch({ latencyMs: 0 }),
    });
    const ids = { serviceTypeId: "1101", planId: "881261004" };
    const targetClientNative1 = client;
    const inputNative1 = ids;
    const groups = await targetClientNative1.run((api) =>
      api.catalog.teamPositions({
        params: inputNative1,
        query: {},
      })
    );
    const targetClientNative2 = client;
    const inputNative2 = ids;
    const times = await targetClientNative2.run((api) =>
      api.planTimes.list({ params: inputNative2 })
    );
    const [, service] = times;
    expect(rowAssignments(service, groups)).toBe("All teams");
    expect(peopleAtTime(service.id, [...groups, ...groups])).toHaveLength(16);
    expect(peopleAtTime("missing", groups)).toStrictEqual([]);
  });
});
