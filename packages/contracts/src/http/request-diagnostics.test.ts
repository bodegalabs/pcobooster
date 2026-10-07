import { describe, expect, it } from "vitest";

import {
  formatAppRelease,
  parseAppRelease,
  parseRequestId,
} from "./request-diagnostics";

describe(parseRequestId, () => {
  it.each([
    [
      "0192f0c4-7a3e-7cc1-9a51-6d2f00a1b2c3",
      "0192f0c4-7a3e-7cc1-9a51-6d2f00a1b2c3",
    ],
    ["  abcdefgh  ", "abcdefgh"],
    ["short", null],
    ["a".repeat(65), null],
    ["id with spaces", null],
    ["<script>alert(1)</script>", null],
    ["line\nbreak-1234", null],
    [null, null],
  ])("%s", (value, expected) => {
    expect(parseRequestId(value)).toBe(expected);
  });
});

describe(formatAppRelease, () => {
  it("names the version, build, and short revision", () => {
    expect(
      formatAppRelease({
        version: "0.1.0",
        build: "372",
        revision: "1a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d",
      })
    ).toBe("0.1.0(372)+1a2b3c4");
  });

  it("leaves out an unknown revision", () => {
    expect(
      formatAppRelease({ version: "0.1.0", build: "372", revision: "unknown" })
    ).toBe("0.1.0(372)");
  });

  it("refuses an unusable version or build", () => {
    expect(
      formatAppRelease({ version: "dev", build: "0", revision: "unknown" })
    ).toBeNull();
  });
});

describe(parseAppRelease, () => {
  it.each([
    ["0.1.0(372)+1a2b3c4", "0.1.0(372)+1a2b3c4"],
    ["0.1.0(372)", "0.1.0(372)"],
    ["0.1.0", null],
    ["0.1.0(372)+NOTHEX!", null],
    [`0.1.0(372)+${"a".repeat(40)}`, null],
    [null, null],
  ])("%s", (value, expected) => {
    expect(parseAppRelease(value)).toBe(expected);
  });
});
