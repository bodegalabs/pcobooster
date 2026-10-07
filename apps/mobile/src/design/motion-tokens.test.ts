import { describe, expect, it } from "vitest";

import { cubicBezier } from "./motion-tokens";

describe(cubicBezier, () => {
  it("matches CSS ease at its midpoint and keeps the ends fixed", () => {
    const ease = cubicBezier(0.25, 0.1, 0.25, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    // Chrome's `ease` at 50% of the time is 80.24% of the way.
    expect(ease(0.5)).toBeCloseTo(0.8024, 3);
  });

  it("is the identity for a straight line", () => {
    const linear = cubicBezier(0, 0, 1, 1);
    for (const progress of [0.1, 0.37, 0.9]) {
      expect(linear(progress)).toBeCloseTo(progress, 5);
    }
  });
});
