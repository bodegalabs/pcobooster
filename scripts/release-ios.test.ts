import { describe, expect, it } from "vitest";

import { iosBuildNumber } from "../apps/mobile/scripts/build-number";

describe("iOS build number", () => {
  it("defaults local native generation to build 1", () => {
    expect(iosBuildNumber()).toBe("1");
  });

  it("preserves explicit release numbers as strings", () => {
    expect(iosBuildNumber("293")).toBe("293");
    expect(iosBuildNumber("370")).toBe("370");
  });

  it.each(["", "0", "-1", "01", "1.2", "1e3", " 293", "293\n"])(
    "refuses invalid native build number %j",
    (value) => {
      expect(() => iosBuildNumber(value)).toThrow("BUILD_NUMBER");
    }
  );
});
