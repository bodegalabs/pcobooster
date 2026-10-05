import { describe, expect, it } from "vitest";

import { rememberActiveTab, withinTab } from "./tab-routing";

describe("Native retained tab stacks", () => {
  it("opens cross-feature details in the caller's tab and keeps canonical parameters", () => {
    rememberActiveTab(["(tabs)", "(people)", "people"]);
    expect(
      withinTab({
        pathname: "/services/[serviceTypeId]/plans/[planId]",
        params: { serviceTypeId: "one", planId: "two", segment: "Lineup" },
      })
    ).toStrictEqual({
      pathname: "/(tabs)/(people)/services/[serviceTypeId]/plans/[planId]",
      params: { serviceTypeId: "one", planId: "two", segment: "Lineup" },
    });
    expect(withinTab("/songs/song/chart?key=D", "(search)")).toStrictEqual({
      pathname: "/(tabs)/(search)/songs/[songId]/chart",
      params: { songId: "song", key: "D" },
    });
    expect(withinTab("/account", "(services)")).toBe("/account");
  });
});
