import { describe, expect, it } from "vitest";

import {
  parsePeoplePageNavState,
  serializePeoplePageNavState,
} from "@/lib/people-page-nav-cache";

describe("people page nav cache", () => {
  it("round-trips enabled state", () => {
    expect(
      parsePeoplePageNavState(serializePeoplePageNavState({ enabled: true }))
    ).toStrictEqual({
      enabled: true,
    });
    expect(
      parsePeoplePageNavState(serializePeoplePageNavState({ enabled: false }))
    ).toStrictEqual({
      enabled: false,
    });
  });

  it("ignores invalid payloads", () => {
    expect(parsePeoplePageNavState(null)).toBeNull();
    expect(parsePeoplePageNavState("{}")).toBeNull();
    expect(parsePeoplePageNavState("{bad json")).toBeNull();
  });
});
