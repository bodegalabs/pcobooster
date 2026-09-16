import { describe, expect, it } from "vitest";

import type { ServiceHistoryItem } from "@/lib/types";

import { pickServiceHistoryGroupClosestToReference } from "./service-history-display";
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
