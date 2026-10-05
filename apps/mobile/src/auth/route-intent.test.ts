import { describe, expect, it } from "vitest";

import {
  consumeNativeRoute,
  isProtectedNativePath,
  protectedNativeHref,
  rememberNativeRoute,
} from "./route-intent";

describe("Native protected route resume", () => {
  it("protects every private root and nested screen while keeping demo links public", () => {
    for (const path of [
      "/services",
      "/services/1/plans/2/assign",
      "/people/3",
      "/songs/4/chart",
      "/search",
      "/account",
    ]) {
      expect(isProtectedNativePath(path)).toBeTruthy();
    }
    for (const path of ["/", "/demo/key", "/auth/callback"]) {
      expect(isProtectedNativePath(path)).toBeFalsy();
    }
  });

  it("resumes exact plan position and segment once after sign-in", () => {
    rememberNativeRoute("/services/1/plans/2/assign", {
      teamId: "team",
      positionId: "slot",
      segment: "Lineup",
    });
    expect(consumeNativeRoute()).toStrictEqual({
      pathname:
        "/(tabs)/(services)/services/[serviceTypeId]/plans/[planId]/assign",
      params: {
        serviceTypeId: "1",
        planId: "2",
        teamId: "team",
        positionId: "slot",
        segment: "Lineup",
      },
    });
    expect(consumeNativeRoute()).toBe("/(tabs)/(services)/services");
    expect(protectedNativeHref("/people/3?month=2026-10")).toStrictEqual({
      pathname: "/people/[personId]",
      params: { personId: "3", month: "2026-10" },
    });
  });

  it("retains the caller's Search stack and custom slot or chart context after expiry", () => {
    rememberNativeRoute(
      "/services/1/plans/2/assign",
      {
        teamId: "team",
        positionId: "custom",
        positionName: "Guest musician",
        source: "custom",
      },
      "(search)"
    );
    expect(consumeNativeRoute()).toMatchObject({
      pathname:
        "/(tabs)/(search)/services/[serviceTypeId]/plans/[planId]/assign",
      params: { source: "custom", positionName: "Guest musician" },
    });
    rememberNativeRoute(
      "/songs/song/chart",
      { arrangementId: "second" },
      "(songs)"
    );
    expect(consumeNativeRoute()).toStrictEqual({
      pathname: "/(tabs)/(songs)/songs/[songId]/chart",
      params: { songId: "song", arrangementId: "second" },
    });
  });
});
