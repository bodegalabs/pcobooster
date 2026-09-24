import { describe, expect, it } from "vitest";

import {
  changedKeys,
  dashboardChanges,
  insightChanges,
  matchesDeclared,
  tileOrder,
} from "./drift";

describe(matchesDeclared, () => {
  it("ignores keys PostHog adds to saved objects", () => {
    expect(
      matchesDeclared(
        { kind: "TrendsQuery", dateRange: { date_from: "-30d" } },
        {
          kind: "TrendsQuery",
          dateRange: { date_from: "-30d", explicitDate: false },
          version: 4,
        }
      )
    ).toBeTruthy();
  });

  it("detects changed nested values", () => {
    expect(
      matchesDeclared(
        { dateRange: { date_from: "-30d" } },
        { dateRange: { date_from: "-7d" } }
      )
    ).toBeFalsy();
  });

  it("treats arrays as ordered and exact in length", () => {
    expect(matchesDeclared([1, 2], [1, 2])).toBeTruthy();
    expect(matchesDeclared([1, 2], [2, 1])).toBeFalsy();
    expect(matchesDeclared([1], [1, 2])).toBeFalsy();
    expect(matchesDeclared([{ a: 1 }], [{ a: 1, b: 2 }])).toBeTruthy();
  });

  it("distinguishes missing values from false and null", () => {
    expect(matchesDeclared({ a: false }, {})).toBeFalsy();
    expect(matchesDeclared({ a: null }, {})).toBeFalsy();
    expect(matchesDeclared({ a: false }, { a: null })).toBeFalsy();
  });
});

describe(changedKeys, () => {
  it("lists only declared keys whose live values differ", () => {
    expect(
      changedKeys(
        {
          timezone: "America/Los_Angeles",
          session_recording_sample_rate: "0.20",
        },
        {
          timezone: "America/Los_Angeles",
          session_recording_sample_rate: "0.50",
          api_token: "ignored",
        }
      )
    ).toStrictEqual(["session_recording_sample_rate"]);
  });
});

const dashboard = {
  name: "Marketing",
  description: "Visitors",
  pinned: true,
  tags: ["pcobooster", "marketing"],
};

describe(dashboardChanges, () => {
  it("compares tags as a set", () => {
    expect(
      dashboardChanges(dashboard, {
        ...dashboard,
        tags: ["marketing", "pcobooster"],
      })
    ).toStrictEqual([]);
  });

  it("reports each changed field", () => {
    expect(
      dashboardChanges(dashboard, {
        ...dashboard,
        pinned: false,
        tags: ["pcobooster"],
      })
    ).toStrictEqual(["pinned", "tags"]);
  });
});

const insight = {
  name: "Daily visitors",
  description: "Unique visitors",
  favorited: true,
  tags: ["pcobooster"],
  query: { kind: "InsightVizNode", source: { kind: "TrendsQuery" } },
  dashboardIds: [1],
};

describe(insightChanges, () => {
  it("reports no changes for an equivalent live insight", () => {
    expect(
      insightChanges(insight, {
        ...insight,
        query: { ...insight.query, extra: true },
      })
    ).toStrictEqual([]);
  });

  it("names dashboard membership changes after the request field", () => {
    expect(
      insightChanges(insight, {
        ...insight,
        dashboardIds: [1, 2],
        query: { kind: "InsightVizNode", source: { kind: "FunnelsQuery" } },
      })
    ).toStrictEqual(["query", "dashboards"]);
  });
});

describe(tileOrder, () => {
  const tiles = [
    { tileId: 10, insightId: 1 },
    { tileId: 20, insightId: 2 },
    { tileId: 30, insightId: null },
  ];

  it("returns undefined when declared insights are already in order", () => {
    expect(tileOrder(tiles, [1, 2])).toBeUndefined();
  });

  it("puts declared insights first and keeps other tiles after them", () => {
    expect(tileOrder(tiles, [2, 1])).toStrictEqual([20, 10, 30]);
  });

  it("ignores declared insights that are not on the dashboard yet", () => {
    expect(tileOrder(tiles, [3, 1, 2])).toBeUndefined();
  });
});
