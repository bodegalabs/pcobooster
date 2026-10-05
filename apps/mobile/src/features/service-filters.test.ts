import type { Plan } from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

import { defaultServiceFilters, filterServicePlans } from "./service-filters";

const plans: Plan[] = [
  {
    id: "same-org-day",
    title: "Evening prayer",
    createdAt: new Date("2026-09-01T12:00:00Z"),
    sortDate: new Date("2026-10-06T02:00:00Z"),
  },
  {
    id: "past",
    title: "Sunday worship",
    createdAt: new Date("2026-09-01T12:00:00Z"),
    sortDate: new Date("2026-10-05T02:00:00Z"),
  },
  {
    id: "distant",
    title: "Advent worship",
    createdAt: new Date("2026-09-01T12:00:00Z"),
    sortDate: new Date("2026-12-20T17:00:00Z"),
  },
];
const now = new Date("2026-10-05T20:00:00Z");
const timeZone = "America/Los_Angeles";

describe("native service filters", () => {
  it("uses congregation days at midnight boundaries and applies the chosen window", () => {
    expect(
      filterServicePlans(
        plans,
        defaultServiceFilters,
        "",
        new Set(),
        now,
        timeZone
      ).map((plan) => plan.id)
    ).toStrictEqual(["same-org-day"]);
  });

  it("combines saved my-services selection with search while recent selection excludes upcoming plans", () => {
    expect(
      filterServicePlans(
        plans,
        { ...defaultServiceFilters, onlyMine: true, dateWindow: "Recent" },
        " WORSHIP ",
        new Set(["past"]),
        now,
        timeZone
      ).map((plan) => plan.id)
    ).toStrictEqual(["past"]);
  });
});
