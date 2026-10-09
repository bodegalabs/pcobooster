/**
 * The motion vocabulary as plain values: the house curves as functions of 0 to 1 and the
 * durations. No React Native imports, so pure logic (rocket poses) and tests can use it.
 */

const NEWTON_ITERATIONS = 8;
const BISECTION_ITERATIONS = 24;
const EPSILON = 1e-6;

/**
 * A CSS `cubic-bezier(x1, y1, x2, y2)` timing function: progress 0 to 1 in, eased progress out.
 * Callable from worklets.
 */
export const cubicBezier = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): ((progress: number) => number) => {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  return (progress: number): number => {
    "worklet";
    if (progress <= 0 || progress >= 1) {
      return Math.min(1, Math.max(0, progress));
    }
    // Find the curve parameter whose x is `progress`: Newton steps, then bisection.
    let t = progress;
    for (let index = 0; index < NEWTON_ITERATIONS; index += 1) {
      const error = ((ax * t + bx) * t + cx) * t - progress;
      if (Math.abs(error) < EPSILON) {
        return ((ay * t + by) * t + cy) * t;
      }
      const slope = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(slope) < EPSILON) {
        break;
      }
      t -= error / slope;
    }
    let low = 0;
    let high = 1;
    t = progress;
    for (let index = 0; index < BISECTION_ITERATIONS; index += 1) {
      const x = ((ax * t + bx) * t + cx) * t;
      if (Math.abs(x - progress) < EPSILON) {
        break;
      }
      if (x < progress) {
        low = t;
      } else {
        high = t;
      }
      t = (low + high) / 2;
    }
    return ((ay * t + by) * t + cy) * t;
  };
};

/** The house curves as functions of 0 to 1 (callable in worklets and `withTiming`). */
export const Curves = {
  /** `--ease-snappy`: fast start, soft landing. */
  snappy: cubicBezier(0.23, 1, 0.32, 1),
  /** `--ease-glide` for replays and deliberate moves. */
  glide: cubicBezier(0.77, 0, 0.175, 1),
  /** Ease-in for things that leave (the sign-in launch-away). */
  launch: cubicBezier(0.55, 0, 1, 0.45),
  /** Material standard, for the skeleton sweep. */
  sweep: cubicBezier(0.4, 0, 0.2, 1),
  /** The indeterminate progress sweep. */
  progress: cubicBezier(0.65, 0, 0.35, 1),
} as const;

/**
 * Motion tokens, matching the web (`apps/web/src/styles/globals.css`) and the Swift app. Short,
 * consistent, and always with a Reduce Motion fallback: loops stop, movement becomes a fade or
 * nothing. Animate position, size, and opacity; selection and highlight colors change instantly.
 */
export const Motion = {
  // Durations, in milliseconds
  /** Rocket takeoff, start to settle (web `BRAND_ANIMATION_MS`). */
  rocketTakeoff: 320,
  /** Rocket replay on tap. */
  rocketReplay: 340,
  /** Rocket launch-away before Planning Center sign-in. */
  rocketLaunch: 420,
  /** One status dot pulse; every dot shares the same phase. */
  statusPulsePeriod: 2400,
  /** Skeletons wait this long before appearing so fast loads never flash. */
  skeletonDelay: 120,
  /** Skeleton fade-in once the delay passes. */
  skeletonFade: 240,
  /** One shimmer sweep across a skeleton. */
  skeletonSweepPeriod: 1000,
  /** Indeterminate progress waits this long before showing. */
  progressDelay: 200,
  /** One indeterminate progress sweep. */
  progressSweepPeriod: 1100,
  /** Content replacing a skeleton fades in over this long (web `content-enter`). */
  reveal: 200,
  /** Stale content dims after this delay while a refetch runs. */
  staleDelay: 150,
  /** Opacity of stale content during a refetch. */
  staleOpacity: 0.55,
  /** Sign-in entrance: each child rises 8 pt and fades over 360 ms, 60 ms apart. */
  entrance: 360,
  entranceStagger: 60,
  entranceRise: 8,
  /** How long an error toast stays before dismissing itself. */
  toast: 4500,
  /** Press feedback on pills and cards. */
  press: 150,
  pressCard: 180,
} as const;
