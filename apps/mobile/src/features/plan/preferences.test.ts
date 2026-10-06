import { describe, expect, it } from "vitest";

import {
  collapsedTeams,
  decodeCollapsedTeams,
  setCollapsedTeams,
} from "./preferences";

describe("collapsed teams per plan", () => {
  it("keeps each plan separate and survives a storage round trip", () => {
    const first = setCollapsedTeams({}, "one", new Set(["band"]));
    const second = setCollapsedTeams(first, "two", new Set(["hosts"]));
    const restored = decodeCollapsedTeams(structuredClone(second));
    expect(collapsedTeams(restored, "one")).toStrictEqual(new Set(["band"]));
    expect(collapsedTeams(restored, "two")).toStrictEqual(new Set(["hosts"]));
    expect(collapsedTeams(restored, "three")).toStrictEqual(new Set());
    expect(
      collapsedTeams(setCollapsedTeams(restored, "one", new Set()), "one")
    ).toStrictEqual(new Set());
  });

  it("ignores malformed device preferences", () => {
    expect(decodeCollapsedTeams({ one: [42] })).toStrictEqual({});
  });
});
