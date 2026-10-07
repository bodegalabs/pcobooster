import { scoreAndNormalizePeople } from "@pcobooster/planning-center-models/candidate-scoring";
import {
  groupRankingReasons,
  preferenceConflicts,
} from "@pcobooster/planning-center-models/ranking-reasons";
import type { PersonWithAvailability } from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

const person = (
  frequency?: PersonWithAvailability["frequency"]
): PersonWithAvailability => ({
  id: "1",
  firstName: "Avery",
  lastName: "Collins",
  fullName: "Avery Collins",
  photoUrl: null,
  photoThumbnailUrl: null,
  archived: false,
  positions: [],
  frequency,
});

const reasoningFor = (candidate: PersonWithAvailability) => {
  scoreAndNormalizePeople(
    [candidate],
    new Date("2026-09-27T17:00:00Z"),
    "America/Los_Angeles"
  );
  return candidate.recommendationReasoning ?? [];
};

describe(groupRankingReasons, () => {
  it("attaches adjustments to the service or rehearsal they follow", () => {
    const reasons = reasoningFor(
      person({
        recentServedDays: 3,
        last60Days: 3,
        last90Days: 4,
        lastServedDate: new Date("2026-09-20T17:00:00Z"),
        totalServed: 6,
        recentRehearsalOnlyDays: 2,
        rehearsalLast60Days: 2,
        rehearsalLast90Days: 2,
        totalRehearsals: 2,
        upcomingServices: 1,
        nextUpcomingDate: new Date("2026-10-04T17:00:00Z"),
        upcomingRehearsals: 1,
        nextRehearsalDate: new Date("2026-10-01T02:00:00Z"),
      })
    );

    const facts = groupRankingReasons(reasons);

    expect(
      facts.map(({ kind, adjustments }) => [kind, adjustments.length])
    ).toStrictEqual([
      ["history", 0],
      ["service", 1],
      ["rehearsal", 1],
      ["load", 0],
      ["load", 0],
    ]);
    expect(
      facts.flatMap(({ text, adjustments }) => [text, ...adjustments])
    ).toStrictEqual(reasons);
  });

  it("marks someone with no history as fresh", () => {
    expect(groupRankingReasons(reasoningFor(person()))).toStrictEqual([
      {
        kind: "fresh",
        text: "No service history available (treated as no recent/upcoming load)",
        adjustments: [],
      },
    ]);
  });

  it("keeps unrecognized lines as notes", () => {
    expect(groupRankingReasons(["Something new"])).toStrictEqual([
      { kind: "note", text: "Something new", adjustments: [] },
    ]);
  });

  it("gives Planning Center preferences their own facts with their adjustments", () => {
    expect(
      groupRankingReasons([
        "Last served 7 days before on Sun, Sep 20, 2026",
        "Prefers to serve every other week",
        "Ranked lower: served 7 days before",
        "At most 2 plans a month; this plan fits",
        "Marked Unavailable for this position in Planning Center",
        "Ranked lower: asked not to be scheduled here",
      ])
    ).toStrictEqual([
      {
        kind: "history",
        text: "Last served 7 days before on Sun, Sep 20, 2026",
        adjustments: [],
      },
      {
        kind: "preference",
        text: "Prefers to serve every other week",
        adjustments: ["Ranked lower: served 7 days before"],
      },
      {
        kind: "preference",
        text: "At most 2 plans a month; this plan fits",
        adjustments: [],
      },
      {
        kind: "preference",
        text: "Marked Unavailable for this position in Planning Center",
        adjustments: ["Ranked lower: asked not to be scheduled here"],
      },
    ]);
  });
});

describe(preferenceConflicts, () => {
  it("keeps only the preferences this plan goes against, in short form", () => {
    expect(
      preferenceConflicts([
        "Last served 7 days before on Sun, Sep 20, 2026",
        "Prefers to serve every other week",
        "Ranked lower: served 7 days before",
        "At most 2 plans a month; this plan fits",
        "Marked Unavailable for this position in Planning Center",
        "Ranked lower: asked not to be scheduled here",
      ])
    ).toStrictEqual([
      "Prefers every other week",
      "Marked Unavailable for this position",
    ]);
  });
});
