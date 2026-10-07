import { describe, expect, it } from "vitest";

import { overviewSongKeys, overviewTimeTitle } from "./presentation";

describe("Overview row presentation", () => {
  it("renders exactly two modulation keys and preserves other written keys", () => {
    expect(overviewSongKeys("G to A")).toStrictEqual({ from: "G", to: "A" });
    expect(overviewSongKeys("F# minor to Bb")).toStrictEqual({
      from: "F# minor",
      to: "Bb",
    });
    expect(overviewSongKeys(null)).toBeNull();
    expect(overviewSongKeys("C")).toBeNull();
    expect(overviewSongKeys("G to A to B")).toBeNull();
  });

  it("prefers a trimmed time name and labels unnamed known and unknown times", () => {
    expect(overviewTimeTitle("  First service  ", "service")).toBe(
      "First service"
    );
    expect(overviewTimeTitle(" ", "service")).toBe("Service");
    expect(overviewTimeTitle("", "rehearsal")).toBe("Rehearsal");
    expect(overviewTimeTitle("", "other")).toBe("Other");
    expect(overviewTimeTitle("", "setup TIME")).toBe("Setup Time");
  });
});
