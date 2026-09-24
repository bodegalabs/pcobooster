import { describe, expect, it } from "vitest";

import { findLongDashes } from "./no-long-dashes";

describe(findLongDashes, () => {
  it("finds both long dashes with file locations", () => {
    expect(
      findLongDashes("copy.md", "Clear\u2014simple\nOne\u2013three")
    ).toStrictEqual([
      { path: "copy.md", line: 1, column: 6 },
      { path: "copy.md", line: 2, column: 4 },
    ]);
  });

  it("accepts ordinary hyphens and punctuation", () => {
    expect(findLongDashes("copy.ts", "One-three. Keep it clear.")).toEqual([]);
  });
});
