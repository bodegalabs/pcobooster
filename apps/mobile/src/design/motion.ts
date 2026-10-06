import { Easing, ReduceMotion, cubicBezier } from "react-native-reanimated";
import type { WithTimingConfig } from "react-native-reanimated";

import { Curves, Motion } from "./motion-tokens";

/** The same curves for Reanimated CSS transitions (`transitionTimingFunction`). */
export const CssCurves = {
  snappy: cubicBezier(0.23, 1, 0.32, 1),
  launch: cubicBezier(0.55, 0, 1, 0.45),
} as const;

/** The house curve over `duration` (default 200 ms, the web's most common transition). */
export const snappy = (duration = 200): WithTimingConfig => ({
  duration,
  easing: Curves.snappy,
  reduceMotion: ReduceMotion.System,
});

/**
 * `animation`, or a plain fade-length ease when Reduce Motion is on (opacity-only changes should
 * still read), or nothing when `instantWhenReduced` is set (Swift `Motion.respecting`).
 */
export const respecting = (
  reduceMotion: boolean,
  animation: WithTimingConfig,
  { instantWhenReduced = false }: { readonly instantWhenReduced?: boolean } = {}
): WithTimingConfig => {
  if (!reduceMotion) {
    return animation;
  }
  return instantWhenReduced
    ? { duration: 0 }
    : { duration: Motion.reveal, easing: Easing.inOut(Easing.ease) };
};

/**
 * 0 at rest, 1 at the middle of a shared pulse, eased like CSS `ease-in-out`. Computed from the
 * clock so every pulsing dot on screen shares one phase.
 */
export const pulsePhase = (nowMs: number): number => {
  "worklet";
  const t = (nowMs % Motion.statusPulsePeriod) / Motion.statusPulsePeriod;
  return (1 - Math.cos(t * 2 * Math.PI)) / 2;
};
