import { describe, expect, it } from "vitest";

import { selectedCustomSlot } from "./assign-slot";

describe("Native custom slot selection", () => {
  it("stops treating the route's custom position as selected after choosing a real slot", () => {
    const route = {
      source: "custom",
      teamId: "band",
      positionId: "custom-guitar",
    };
    expect(
      selectedCustomSlot(route, { teamId: "band", positionId: "custom-guitar" })
    ).toBeTruthy();
    expect(
      selectedCustomSlot(route, { teamId: "band", positionId: "guitar" })
    ).toBeFalsy();
    expect(
      selectedCustomSlot(route, {
        teamId: "vocals",
        positionId: "custom-guitar",
      })
    ).toBeFalsy();
  });
});
