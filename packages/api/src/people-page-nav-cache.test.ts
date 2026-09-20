import {
  parsePeoplePageNavState,
  serializePeoplePageNavState,
} from "@worship-admin/api/people-page-nav-cache";
import { describe, expect, it } from "vitest";

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
