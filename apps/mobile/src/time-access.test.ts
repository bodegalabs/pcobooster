import { describe, expect, it } from "vitest";

import {
  allowedTimeTypes,
  canChangeTime,
  timeAccessNotice,
} from "./time-access";

describe("native time permissions from Planning Center", () => {
  it("allows Editors all time types", () => {
    const access = { canEdit: true, canSchedule: false };
    expect(allowedTimeTypes(access)).toStrictEqual([
      "service",
      "rehearsal",
      "other",
    ]);
    expect(canChangeTime(access, "service")).toBeTruthy();
    expect(timeAccessNotice(access)).toBeNull();
  });

  it("allows team-leading Schedulers rehearsal and other times while protecting service times", () => {
    const access = { canEdit: false, canSchedule: true };
    expect(allowedTimeTypes(access)).toStrictEqual(["rehearsal", "other"]);
    expect(canChangeTime(access, "service")).toBeFalsy();
    expect(canChangeTime(access, "rehearsal")).toBeTruthy();
    expect(canChangeTime(access, "other")).toBeTruthy();
    expect(timeAccessNotice(access)).toContain("Service times need Editor");
  });

  it("keeps viewers and the read-only demo out of all time mutations", () => {
    const access = { canEdit: false, canSchedule: false };
    expect(allowedTimeTypes(access)).toStrictEqual([]);
    expect(canChangeTime(access, "rehearsal")).toBeFalsy();
    expect(canChangeTime(access, "other")).toBeFalsy();
  });
});
