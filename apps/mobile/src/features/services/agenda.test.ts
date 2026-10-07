import type { ServicePlanRow } from "@pcobooster/planning-center-models/service-plans";
import { describe, expect, it } from "vitest";

import {
  noLaunchOptions,
  parseLaunchOptions,
} from "../../harness/launch-options";
import {
  initialServiceTypeSelection,
  myRows,
  serviceTypeSummary,
  visibleRows,
  windowFooter,
} from "./agenda";

const TIME_ZONE = "America/Los_Angeles";
/** Thu Oct 1 2026, 10 AM in Los Angeles. */
const NOW = new Date("2026-10-01T17:00:00.000Z");

const row = (
  planId: string,
  sortDate: string,
  overrides: Partial<ServicePlanRow> = {}
): ServicePlanRow => ({
  serviceTypeId: "1101",
  serviceTypeName: "Sunday Gathering",
  serviceTypeSequence: 0,
  planId,
  planTitle: "Deep Roots",
  seriesTitle: "Rooted",
  seriesId: null,
  sortDate: new Date(sortDate),
  ...overrides,
});

const upcoming = [
  row("soon", "2026-10-04T16:00:00.000Z"),
  // Saturday Oct 31, 7 PM in Los Angeles: November 1 in UTC, still inside 30 days locally.
  row("edge", "2026-11-01T02:00:00.000Z", {
    serviceTypeName: "Youth Night",
    planTitle: "Questions",
    seriesTitle: null,
  }),
  row("later", "2026-12-20T17:00:00.000Z", { planTitle: "Advent" }),
];

describe(initialServiceTypeSelection, () => {
  it("starts Services on the service type requested by the native launch argument", () => {
    const options = parseLaunchOptions((key) =>
      key === "PCOBServiceType" ? "1101" : null
    );
    const selection = initialServiceTypeSelection(options.serviceTypeId);
    expect(selection).toStrictEqual(["1101"]);
    expect(
      serviceTypeSummary(
        [
          { id: "1101", name: "Sunday Gathering" },
          { id: "1102", name: "Youth Night" },
        ],
        new Set(selection)
      )
    ).toBe("Sunday Gathering");
  });

  it("retains the all-services default without an argument or in a release launch", () => {
    const options = parseLaunchOptions(() => null);
    expect(initialServiceTypeSelection(options.serviceTypeId)).toBeNull();
    expect(
      initialServiceTypeSelection(noLaunchOptions.serviceTypeId)
    ).toBeNull();
  });
});

describe(visibleRows, () => {
  const base = {
    upcoming,
    recent: [],
    searchText: "",
    timeZone: TIME_ZONE,
    now: NOW,
  };

  it("keeps the window's days on the congregation calendar", () => {
    expect(
      visibleRows({ ...base, window: "next30Days" }).map((r) => r.planId)
    ).toStrictEqual(["soon", "edge"]);
    expect(
      visibleRows({ ...base, window: "allUpcoming" }).map((r) => r.planId)
    ).toStrictEqual(["soon", "edge", "later"]);
  });

  it("matches the search against titles and the written date, ignoring case and accents", () => {
    expect(
      visibleRows({ ...base, window: "allUpcoming", searchText: "ADVÉNT" }).map(
        (r) => r.planId
      )
    ).toStrictEqual(["later"]);
    expect(
      visibleRows({ ...base, window: "allUpcoming", searchText: "Oct 31" }).map(
        (r) => r.planId
      )
    ).toStrictEqual(["edge"]);
  });

  it("lists recent plans newest first and drops any not yet past", () => {
    const recent = [
      row("older", "2026-09-20T16:00:00.000Z"),
      row("newer", "2026-09-27T16:00:00.000Z"),
      row("future", "2026-10-04T16:00:00.000Z"),
    ];
    expect(
      visibleRows({ ...base, recent, window: "recent" }).map((r) => r.planId)
    ).toStrictEqual(["newer", "older"]);
  });
});

describe(myRows, () => {
  it("keeps the person's plans inside the window, and none for recent plans", () => {
    const input = {
      upcoming,
      myPlanIds: new Set(["soon", "later"]),
      timeZone: TIME_ZONE,
      now: NOW,
    };
    expect(
      myRows({ ...input, window: "next60Days" }).map((r) => r.planId)
    ).toStrictEqual(["soon"]);
    expect(myRows({ ...input, window: "recent" })).toStrictEqual([]);
  });
});

describe(serviceTypeSummary, () => {
  const all = [
    { id: "1", name: "Sunday Gathering" },
    { id: "2", name: "Youth Night" },
    { id: "3", name: "Special Events" },
  ];

  it("names every, none, a few, or counts the selected service types", () => {
    expect(serviceTypeSummary(all, new Set(["1", "2", "3"]))).toBe(
      "All service types"
    );
    expect(serviceTypeSummary(all, new Set())).toBe("No service types");
    expect(serviceTypeSummary(all, new Set(["2", "1"]))).toBe(
      "Sunday Gathering, Youth Night"
    );
    expect(
      serviceTypeSummary(
        [...all, { id: "4", name: "Retreat" }],
        new Set(["1", "2", "3"])
      )
    ).toBe("3 service types");
  });
});

describe(windowFooter, () => {
  it("offers every upcoming plan from a limited window, and nothing past it", () => {
    expect(windowFooter("next60Days")).toStrictEqual({
      text: "Plans in the next 60 days.",
      action: { title: "Show all upcoming", window: "allUpcoming" },
    });
    expect(windowFooter("allUpcoming")).toBeNull();
  });
});
