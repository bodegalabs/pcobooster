import type { Plan } from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

import {
  listedNeighbors,
  planDateLabel,
  planHeader,
  withoutServiceTypePrefix,
} from "./header";

const plan: Plan = {
  id: "1",
  createdAt: new Date("2026-09-01T12:00:00Z"),
  title: "Sunday Gathering: Rooted",
  seriesId: "series",
  seriesTitle: "Roots",
  sortDate: new Date("2026-10-05T02:00:00Z"),
};

describe("plan header", () => {
  it("strips service prefixes only at a separator and chooses title, series, then service type", () => {
    for (const separator of ["-", ":", "|"]) {
      expect(
        withoutServiceTypePrefix(
          ` sunday gathering ${separator} Rooted `,
          "Sunday Gathering"
        )
      ).toBe("Rooted");
    }
    expect(
      withoutServiceTypePrefix("Sunday Gathering", "Sunday Gathering")
    ).toBe("");
    expect(
      withoutServiceTypePrefix("Sunday Gatherings", "Sunday Gathering")
    ).toBe("Sunday Gatherings");
    expect(
      planHeader(
        plan,
        "Sunday Gathering",
        "America/Los_Angeles",
        new Date("2026-10-01T17:00:00Z")
      )
    ).toStrictEqual({
      title: "Rooted",
      subtitle: "Sun, Oct 4 · Sunday Gathering",
    });
    expect(
      planHeader(
        { ...plan, title: "" },
        "Sunday Gathering",
        "UTC",
        new Date("2026-10-01T17:00:00Z")
      ).title
    ).toBe("Roots");
    expect(
      planHeader(
        null,
        "Sunday Gathering",
        "UTC",
        new Date("2026-10-01T17:00:00Z")
      )
    ).toStrictEqual({
      title: "Sunday Gathering",
      subtitle: "",
    });
  });

  it("compares years and dates in the organization zone", () => {
    expect(
      planDateLabel(
        new Date("2026-01-01T02:00:00Z"),
        "America/Los_Angeles",
        new Date("2026-07-01T12:00:00Z")
      )
    ).toBe("Wed, Dec 31, 2025");
  });

  it("lists up to four closest neighbors, previous in reverse order, and handles a missing anchor", () => {
    const plans = Array.from({ length: 12 }, (_, index) => ({
      ...plan,
      id: String(index),
    }));
    expect(
      listedNeighbors(plans, "6", "previous").map(({ id }) => id)
    ).toStrictEqual(["5", "4", "3", "2"]);
    expect(
      listedNeighbors(plans, "6", "next").map(({ id }) => id)
    ).toStrictEqual(["7", "8", "9", "10"]);
    expect(listedNeighbors(plans, "missing", "next")).toStrictEqual([]);
    expect(listedNeighbors(plans, "0", "previous")).toStrictEqual([]);
  });
});
