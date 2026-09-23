import { describe, expect, it } from "vitest";

import {
  commitmentCellTone,
  heatLevelTone,
} from "@/components/people/calendar";

describe(heatLevelTone, () => {
  it("scales with the number of services", () => {
    expect(heatLevelTone(0)).toBe("empty");
    expect(heatLevelTone(1)).toBe("light");
    expect(heatLevelTone(3)).toBe("busy");
    expect(heatLevelTone(8)).toBe("peak");
  });

  it("treats rehearsal-only days as lightly busy", () => {
    expect(heatLevelTone(0, 2)).toBe("light");
  });
});

describe(commitmentCellTone, () => {
  it("separates confirmed and pending services", () => {
    expect(commitmentCellTone("service", "C")).toBe("confirmed");
    expect(commitmentCellTone("service", "U")).toBe("scheduled");
  });

  it("marks rehearsals", () => {
    expect(commitmentCellTone("rehearsal")).toBe("rehearsal");
  });
});
