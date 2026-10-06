import { Curves, Motion } from "./motion-tokens";

/** Where every part of the rocket is at one instant. Offsets are in the logo's 256-unit space. */
export interface RocketPose {
  /** Whole-rocket offset along the screen diagonal: -15 is down-left, 0 at rest. */
  readonly flight: number;
  readonly opacity: number;
  /** Exhaust group reveal, 0 (tucked under the hull) to 1. */
  readonly exhaust: number;
  /** Each trail capsule, 0 to 1, top to bottom. */
  readonly trails: readonly [number, number, number];
  /** Each dot, 0 to 1, top to bottom. */
  readonly dots: readonly [number, number, number];
}

export const restPose: RocketPose = {
  flight: 0,
  opacity: 1,
  exhaust: 1,
  trails: [1, 1, 1],
  dots: [1, 1, 1],
};

type Stop = readonly [time: number, value: number];

/** CSS-style keyframes: hold before the first stop and after the last, ease each segment. */
export const keyframeValue = (
  time: number,
  stops: readonly Stop[],
  curve: (t: number) => number
): number => {
  const [first] = stops;
  const last = stops.at(-1);
  if (first === undefined || last === undefined) {
    return 0;
  }
  if (time <= first[0]) {
    return first[1];
  }
  if (time >= last[0]) {
    return last[1];
  }
  for (let index = 1; index < stops.length; index += 1) {
    const start = stops[index - 1];
    const end = stops[index];
    if (start !== undefined && end !== undefined && time <= end[0]) {
      const span = end[0] - start[0];
      if (span <= 0) {
        return end[1];
      }
      return start[1] + (end[1] - start[1]) * curve((time - start[0]) / span);
    }
  }
  return last[1];
};

const triple = (
  values: readonly number[]
): readonly [number, number, number] => [
  values[0] ?? 0,
  values[1] ?? 0,
  values[2] ?? 0,
];

const TRAIL_DELAYS_MS = [0, 12, 24] as const;
const TRAIL_GROW_MS = 160;
const DOT_DELAYS_MS = [18, 32, 46] as const;
const DOT_GROW_MS = 170;

/** The web's `sidebar-brand-rocket-takeoff` keyframes, per part, on the snappy curve. */
export const takeoffPose = (elapsedMs: number): RocketPose => ({
  flight: keyframeValue(
    elapsedMs,
    [
      [0, -15],
      [229.6, 2],
      [280, 0],
    ],
    Curves.snappy
  ),
  opacity: keyframeValue(
    elapsedMs,
    [
      [0, 0],
      [50.4, 1],
    ],
    Curves.snappy
  ),
  exhaust: keyframeValue(
    elapsedMs,
    [
      [0, 0],
      [150, 1],
    ],
    Curves.snappy
  ),
  trails: triple(
    TRAIL_DELAYS_MS.map((delay) =>
      keyframeValue(
        elapsedMs,
        [
          [delay, 0],
          [delay + TRAIL_GROW_MS, 1],
        ],
        Curves.snappy
      )
    )
  ),
  dots: triple(
    DOT_DELAYS_MS.map((delay) =>
      keyframeValue(
        elapsedMs,
        [
          [delay, 0],
          [delay + DOT_GROW_MS, 1],
        ],
        Curves.snappy
      )
    )
  ),
});

const TRAIL_HOLDS = [0.28, 0.32, 0.36] as const;
const DOT_HOLDS = [0.3, 0.34, 0.38] as const;

/** The web's `sidebar-brand-rocket-replay` keyframes (fractions of 340 ms, glide curve). */
export const replayPose = (elapsedMs: number): RocketPose => {
  const t = elapsedMs / Motion.rocketReplay;
  const regrow = (hold: number): number =>
    keyframeValue(
      t,
      [
        [0, 1],
        [0.12, 1],
        [0.24, 0],
        [hold, 0],
        [1, 1],
      ],
      Curves.glide
    );
  return {
    flight: keyframeValue(
      t,
      [
        [0, 0],
        [0.12, 0],
        [0.24, -15],
        [0.84, 2],
        [1, 0],
      ],
      Curves.glide
    ),
    opacity: 1,
    exhaust: keyframeValue(
      t,
      [
        [0, 1],
        [0.12, 1],
        [0.24, 0],
        [1, 1],
      ],
      Curves.glide
    ),
    trails: triple(TRAIL_HOLDS.map(regrow)),
    dots: triple(DOT_HOLDS.map(regrow)),
  };
};
