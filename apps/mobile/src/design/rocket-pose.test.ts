import { describe, expect, it } from "vitest";

import {
  keyframeValue,
  replayPose,
  restPose,
  takeoffPose,
} from "./rocket-pose";

const linear = (t: number): number => t;

describe(keyframeValue, () => {
  it("holds before the first stop and after the last", () => {
    const stops = [
      [10, 1],
      [20, 3],
    ] as const;
    expect(keyframeValue(0, stops, linear)).toBe(1);
    expect(keyframeValue(30, stops, linear)).toBe(3);
  });

  it("eases between the surrounding stops", () => {
    const stops = [
      [0, 0],
      [10, 10],
      [20, 30],
    ] as const;
    expect(keyframeValue(5, stops, linear)).toBe(5);
    expect(keyframeValue(15, stops, linear)).toBe(20);
    expect(keyframeValue(15, stops, (t) => t * t)).toBe(15);
  });
});

describe(takeoffPose, () => {
  it("starts hidden down-left with the exhaust tucked in", () => {
    expect(takeoffPose(0)).toStrictEqual({
      flight: -15,
      opacity: 0,
      exhaust: 0,
      trails: [0, 0, 0],
      dots: [0, 0, 0],
    });
  });

  it("overshoots past rest before it settles", () => {
    expect(takeoffPose(229.6).flight).toBeCloseTo(2);
    expect(takeoffPose(320)).toStrictEqual(restPose);
  });
});

describe(replayPose, () => {
  it("pulls back with the exhaust hidden, then returns to rest", () => {
    const pulledBack = replayPose(340 * 0.24);
    expect(pulledBack.flight).toBeCloseTo(-15);
    expect(pulledBack.exhaust).toBeCloseTo(0);
    expect(replayPose(340)).toStrictEqual(restPose);
    expect(replayPose(0)).toStrictEqual(restPose);
  });
});
