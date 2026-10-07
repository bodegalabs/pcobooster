import type { ServicePlanRow } from "@pcobooster/planning-center-models/service-plans";
import { describe, expect, it } from "vitest";

import {
  addRecentItem,
  visibleRecents,
  recentDestination,
  matchingPlans,
  resultRoute,
} from "./model";

const row = (id: string, date: string, title: string): ServicePlanRow => ({
  planId: id,
  sortDate: new Date(date),
  planTitle: title,
  serviceTypeId: "service-a",
  serviceTypeName: "Sunday",
  serviceTypeSequence: 1,
  seriesId: null,
  seriesTitle: "Rooted",
});
describe("mobile search", () => {
  it("matches congregation date, title, series and service and puts upcoming before latest past", () => {
    const rows = [
      row("past", "2026-10-03T23:00:00Z", "Old"),
      row("today", "2026-10-05T01:00:00Z", "Evening"),
      row("next", "2026-10-11T17:00:00Z", "Next"),
    ];
    const now = new Date("2026-10-05T02:00:00Z");
    const zone = "America/Los_Angeles";
    expect(
      matchingPlans(rows, "Rooted", now, zone).map((plan) => plan.planId)
    ).toStrictEqual(["today", "next", "past"]);
    expect(
      matchingPlans(rows, "Oct 4", now, zone).map((plan) => plan.planId)
    ).toStrictEqual(["today"]);
    expect(
      matchingPlans(rows, " evenING ", now, zone).map((plan) => plan.planId)
    ).toStrictEqual(["today"]);
    expect(matchingPlans(rows, "missing", now, zone)).toStrictEqual([]);
  });

  it("deduplicates queries and entities and hides results from unavailable domains", () => {
    const plan = {
      kind: "plans" as const,
      id: "1",
      serviceTypeId: "2",
      title: "Sunday",
      detail: "Oct 4",
    };
    const person = {
      kind: "people" as const,
      id: "3",
      title: "Alex",
      detail: "Person",
    };
    const query = { kind: "query" as const, text: "Grace" };
    const recents = addRecentItem(addRecentItem([plan, person], query), {
      kind: "query",
      text: "grace",
    });
    expect(visibleRecents(recents, ["all", "plans"])).toStrictEqual([
      { kind: "query", text: "grace" },
      plan,
    ]);
    expect(recentDestination(plan)).toBe("/services/2/plans/1");
    expect(recentDestination(person)).toBe("/people/3");
    expect(recentDestination(query)).toBeNull();
    expect(
      addRecentItem(
        Array.from({ length: 10 }, (_, index) => ({
          kind: "query",
          text: `term ${index}`,
        })),
        query
      )
    ).toHaveLength(10);
  });

  it("encodes destinations and preserves service type context", () => {
    expect(resultRoute("plans", "plan/1", "type/2")).toBe(
      "/services/type%2F2/plans/plan%2F1"
    );
    expect(resultRoute("people", "person/1")).toBe("/people/person%2F1");
    expect(resultRoute("songs", "song/1")).toBe("/songs/song%2F1");
    expect(() => resultRoute("plans", "1")).toThrow("service type");
  });
});
