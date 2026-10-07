import { describe, expect, it } from "vitest";

import {
  requireSavedRequestIds,
  isPlaceholderId,
  makePlaceholderIds,
  PlaceholderIdError,
} from "./placeholder-ids";

const ids = { serviceTypeId: "1101", planId: "881261004" };

describe("placeholder ids", () => {
  it("recognizes optimistic items, assignments and pending times", () => {
    expect(
      [
        "optimistic-song-1",
        "optimistic:plan:team:position:person",
        "pending-time-2",
        "881261004",
      ].map(isPlaceholderId)
    ).toStrictEqual([true, true, true, false]);
  });

  it("resolves a landed placeholder and refuses one that never landed", () => {
    const placeholders = makePlaceholderIds();
    placeholders.land("optimistic-item-1", "42");
    expect(placeholders.require("optimistic-item-1")).toBe("42");
    expect(placeholders.require("7")).toBe("7");
    expect(() => placeholders.require("optimistic-item-2")).toThrow(
      PlaceholderIdError
    );
  });

  it("refuses native write inputs containing unresolved IDs", () => {
    expect(() => {
      requireSavedRequestIds({ ...ids, sequence: ["1", "optimistic-item-1"] });
    }).toThrow(PlaceholderIdError);
    expect(() => {
      requireSavedRequestIds({
        ...ids,
        planTimeId: "1",
        assignedPlanPersonIds: ["optimistic:plan:team:position:person"],
      });
    }).toThrow(PlaceholderIdError);
    expect(() => {
      requireSavedRequestIds({
        ...ids,
        itemId: "1",
        title: "optimistic-looking title",
      });
    }).not.toThrow();
  });
});
