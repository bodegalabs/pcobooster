import type { ServiceHistoryItem } from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

import {
  buildServiceHistoryGroups,
  filterServiceHistoryWithinHalfRange,
  formatServiceHistoryDayLabel,
  pickServiceHistoryGroupClosestToReference,
} from "./service-history-display";
import type { ServiceHistoryGroup } from "./service-history-display";

const historyItem = (id: string, iso: string): ServiceHistoryItem => ({
  id,
  sourceScheduleId: `sched-${id}`,
  date: new Date(iso),
  teamPositionName: "Bass",
  teamName: "Band",
  status: "C",
});

const singleGroup = (primary: ServiceHistoryItem): ServiceHistoryGroup => ({
  dayKey: primary.id,
  primary,
  additionalServices: [],
  rehearsals: [],
});

describe(pickServiceHistoryGroupClosestToReference, () => {
  const orgTz = "America/Los_Angeles";
  /** Plan instant on May 4, 2026 (still that calendar day in typical US zones). */
  const planSort = new Date("2026-05-04T17:00:00.000Z");

  it("returns null for empty groups", () => {
    expect(
      pickServiceHistoryGroupClosestToReference([], planSort, orgTz)
    ).toBeNull();
  });

  it("chooses the group whose primary date is nearest in org calendar days", () => {
    const farther = singleGroup(historyItem("far", "2026-05-24T12:00:00.000Z"));
    const closer = singleGroup(
      historyItem("close", "2026-05-06T12:00:00.000Z")
    );
    const picked = pickServiceHistoryGroupClosestToReference(
      [farther, closer],
      planSort,
      orgTz
    );
    expect(picked?.primary.id).toBe("close");
  });

  it("breaks calendar-distance ties using the more recent primary instant", () => {
    const earlier = singleGroup(
      historyItem("earlier", "2026-04-14T12:00:00.000Z")
    );
    const later = singleGroup(historyItem("later", "2026-05-24T12:00:00.000Z"));
    const picked = pickServiceHistoryGroupClosestToReference(
      [earlier, later],
      planSort,
      orgTz
    );
    expect(picked?.primary.id).toBe("later");
  });
});

describe(filterServiceHistoryWithinHalfRange, () => {
  const orgTz = "America/Los_Angeles";
  const planSort = new Date("2026-05-04T17:00:00.000Z");
  const items = [
    historyItem("inside", "2026-05-01T12:00:00.000Z"),
    historyItem("outside", "2026-04-01T12:00:00.000Z"),
  ];

  it("keeps items within the selected half-range of the reference plan", () => {
    expect(
      filterServiceHistoryWithinHalfRange(items, planSort, 7, orgTz).map(
        (item) => item.id
      )
    ).toStrictEqual(["inside"]);
  });

  it("returns all items when the reference date is missing", () => {
    expect(
      filterServiceHistoryWithinHalfRange(items, null, 7, orgTz)
    ).toStrictEqual(items);
  });
});

describe(buildServiceHistoryGroups, () => {
  const orgTz = "America/Los_Angeles";
  /** Sunday September 27, 2026, 10:00 AM in Los Angeles. */
  const sundayService = "2026-09-27T17:00:00.000Z";
  /** Saturday September 26, 2026, 7:00 PM in Los Angeles; Sunday in UTC. */
  const saturdayEvening = "2026-09-27T02:00:00.000Z";

  it("keeps a rehearsal the evening before as its own org day", () => {
    const service: ServiceHistoryItem = {
      ...historyItem("service", sundayService),
      sourceScheduleId: "sched-sunday",
      timeType: "service",
    };
    const rehearsal: ServiceHistoryItem = {
      ...historyItem("rehearsal", saturdayEvening),
      sourceScheduleId: "sched-sunday",
      timeType: "rehearsal",
    };

    const groups = buildServiceHistoryGroups([service, rehearsal], orgTz);

    expect(
      groups.map((group) => ({
        primary: group.primary.id,
        rehearsals: group.rehearsals.map((item) => item.id),
      }))
    ).toStrictEqual([{ primary: "service", rehearsals: ["rehearsal"] }]);
  });

  it("does not merge services on different org days that share a UTC day", () => {
    const groups = buildServiceHistoryGroups(
      [
        { ...historyItem("saturday", saturdayEvening), timeType: "service" },
        { ...historyItem("sunday", sundayService), timeType: "service" },
      ],
      orgTz
    );

    expect(groups.map((group) => group.primary.id)).toStrictEqual([
      "saturday",
      "sunday",
    ]);
  });
});

describe(formatServiceHistoryDayLabel, () => {
  it("labels the org calendar day of a late-evening service", () => {
    expect(
      formatServiceHistoryDayLabel(
        "2026-09-27T02:00:00.000Z",
        "America/Los_Angeles"
      )
    ).toBe("Sat, Sep 26");
  });

  it("describes missing and unparseable dates", () => {
    expect(
      [undefined, "", "not a date"].map((value) =>
        formatServiceHistoryDayLabel(value, "America/Los_Angeles")
      )
    ).toStrictEqual(["Unknown date", "Unknown date", "Invalid date"]);
  });
});
