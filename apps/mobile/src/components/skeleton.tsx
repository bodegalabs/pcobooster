import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { DimensionValue } from "react-native";
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { colors, resolvedTokenColor, useColorVariant } from "../design/colors";
import { Metrics, Radius, Spacing } from "../design/metrics";
import { snappy } from "../design/motion";
import { Curves, Motion } from "../design/motion-tokens";
import { useSurfaceColor } from "./surface-card";

const skeletonVariants = {
  /** Cards, panels, and other large surfaces. */
  block: { radius: Radius.inner, height: 96 },
  /** Buttons, inputs, and calendar cells. */
  control: { radius: Radius.control, height: 36 },
  /** A single line of text. */
  text: { radius: Radius.small, height: 12 },
  /** Avatars, dots, and capsule badges. */
  round: { radius: Radius.capsule, height: 32 },
} as const;

const SHIMMER_OPACITY = 0.55;

const styles = StyleSheet.create({
  base: { backgroundColor: colors.surfaceMuted, overflow: "hidden" },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.md,
    minHeight: Metrics.minimumTapTarget + Spacing.sm,
  },
  rowText: { gap: Spacing.sm },
  shimmer: { bottom: 0, position: "absolute", top: 0 },
});

/** Eased 0 to 1 position within the shared sweep, so every skeleton shimmers in step. */
const sweepProgress = (nowMs: number): number => {
  "worklet";
  return Curves.sweep(
    (nowMs % Motion.skeletonSweepPeriod) / Motion.skeletonSweepPeriod
  );
};

interface SkeletonProps {
  readonly variant?: keyof typeof skeletonVariants;
  readonly width?: DimensionValue;
  readonly height?: number;
}

/**
 * A loading placeholder with the web's choreography: invisible for the first 120 ms so fast
 * loads never flash, a 240 ms fade in, then a soft shimmer sweep every 1.6 s. Reduce Motion
 * keeps the delayed fade and drops the sweep.
 */
export const Skeleton = ({
  variant = "block",
  width,
  height,
}: SkeletonProps) => {
  const metrics = skeletonVariants[variant];
  const reduceMotion = useReducedMotion();
  const surface = useSurfaceColor();
  const appearance = useColorVariant();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const visibility = useSharedValue(0);
  const progress = useSharedValue(0);
  useEffect(() => {
    visibility.set(
      withDelay(
        Motion.skeletonDelay,
        withTiming(1, snappy(Motion.skeletonFade))
      )
    );
  }, [visibility]);
  useFrameCallback(() => {
    progress.set(sweepProgress(Date.now()));
  }, !reduceMotion);
  const fade = useAnimatedStyle(() => ({ opacity: visibility.get() }));
  // The highlight's center travels from half a width left of the view to half a width right.
  const sweep = useAnimatedStyle(() => ({
    transform: [
      { translateX: -measuredWidth * 1.5 + progress.get() * 2 * measuredWidth },
    ],
  }));
  const highlight = resolvedTokenColor(surface, appearance, SHIMMER_OPACITY);
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(event) => {
        setMeasuredWidth(event.nativeEvent.layout.width);
      }}
      style={[
        styles.base,
        {
          borderCurve: "continuous",
          borderRadius: metrics.radius,
          height: height ?? metrics.height,
          width: width ?? "100%",
        },
        fade,
      ]}
    >
      {reduceMotion || measuredWidth === 0 ? null : (
        <Animated.View
          style={[
            styles.shimmer,
            {
              experimental_backgroundImage: `linear-gradient(to right, transparent 20%, ${highlight} 50%, transparent 80%)`,
              width: measuredWidth * 2,
            },
            sweep,
          ]}
        />
      )}
    </Animated.View>
  );
};

interface SkeletonRowProps {
  readonly showsAvatar?: boolean;
  readonly titleWidth?: number;
  readonly detailWidth?: number;
}

/** A placeholder for a person or song row: a round avatar and two text lines. */
export const SkeletonRow = ({
  showsAvatar = true,
  titleWidth = 140,
  detailWidth = 90,
}: SkeletonRowProps) => (
  <View style={styles.row}>
    {showsAvatar ? <Skeleton height={32} variant="round" width={32} /> : null}
    <View style={styles.rowText}>
      <Skeleton height={12} variant="text" width={titleWidth} />
      <Skeleton height={10} variant="text" width={detailWidth} />
    </View>
  </View>
);
