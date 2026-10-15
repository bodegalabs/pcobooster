import { Easing, interpolate, spring } from "remotion";

import { FPS } from "./format";

/** Quick to start, long soft landing: the site's `--ease-snappy` feel. */
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
/** For camera moves and cursor travel, which should start and settle gently. */
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 0 → 1 over `duration` frames from `start`, eased out. */
export const progress = (
  frame: number,
  start: number,
  duration: number,
  easing: (input: number) => number = easeOut
): number =>
  interpolate(frame, [start, start + duration], [0, 1], { ...clamp, easing });

/** A critically damped spring: settles without overshoot, like a well-made UI. */
export const settle = (frame: number, start: number, duration = 24): number =>
  spring({
    frame: frame - start,
    fps: FPS,
    durationInFrames: duration,
    config: { damping: 200 },
  });

/** A spring with a little life, for marks and pills landing. */
export const pop = (frame: number, start: number): number =>
  spring({
    frame: frame - start,
    fps: FPS,
    config: { damping: 14, stiffness: 160, mass: 0.7 },
  });

export const mix = (from: number, to: number, amount: number): number =>
  from + (to - from) * amount;

/** A 0 → 1 → 0 bump lasting `length` frames after each of `starts`; overlaps take the max. */
export const pulse = (
  frame: number,
  starts: readonly number[],
  length: number
): number => {
  let amount = 0;
  for (const start of starts) {
    const into = frame - start;
    if (into >= 0 && into < length) {
      amount = Math.max(amount, Math.sin((into / length) * Math.PI));
    }
  }
  return amount;
};
