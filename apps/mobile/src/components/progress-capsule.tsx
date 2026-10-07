import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { colors, tokenColor } from "../design/colors";
import { Metrics, Radius } from "../design/metrics";
import { snappy } from "../design/motion";
import { Curves, Motion } from "../design/motion-tokens";
import { toneColors } from "../design/status";
import type { StatusTone } from "../design/status";

const TRACK_OPACITY = 0.08;
const FILL_OPACITY = 0.35;
/** The indeterminate segment is 40% of the track and travels 3.5 segments per sweep. */
const SEGMENT_FRACTION = 0.4;
const SWEEP_SEGMENTS = 3.5;
const REDUCED_MIN_OPACITY = 0.35;
const FILL_DURATION = 300;

const styles = StyleSheet.create({
  capsule: {
    borderRadius: Radius.capsule,
    height: "100%",
    left: 0,
    position: "absolute",
    top: 0,
  },
  track: { borderRadius: Radius.capsule, overflow: "hidden" },
});

type ProgressCapsuleProps = {
  readonly thickness?: number;
  /** Spoken by VoiceOver. "Loading" by default. */
  readonly label?: string;
} & (
  | {
      /** 0 to 1, or `null` while the total is unknown. */
      readonly value: number | null;
      /** Colors a meter fill; without one the fill is ink at 35% like the web's loading bar. */
      readonly tone?: StatusTone;
    }
  | { readonly completed: number; readonly total: number }
);

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

/** What the capsule draws and speaks. */
interface ResolvedProgress {
  /** 0 to 1, or `null` for the indeterminate sweep. */
  readonly value: number | null;
  readonly tone: StatusTone | undefined;
  /** VoiceOver's value, such as "3 of 8" or "40%". */
  readonly spoken: string;
}

const resolve = (props: ProgressCapsuleProps): ResolvedProgress => {
  if ("completed" in props) {
    if (props.total <= 0) {
      return { value: null, tone: undefined, spoken: "In progress" };
    }
    return {
      value: clampUnit(props.completed / props.total),
      tone: undefined,
      spoken: `${props.completed} of ${props.total}`,
    };
  }
  if (props.value === null) {
    return { value: null, tone: props.tone, spoken: "In progress" };
  }
  const value = clampUnit(props.value);
  return { value, tone: props.tone, spoken: `${Math.round(value * 100)}%` };
};

const Indeterminate = ({
  width,
  thickness,
  tone,
}: {
  width: number;
  thickness: number;
  tone?: StatusTone;
}) => {
  const reduceMotion = useReducedMotion();
  const visibility = useSharedValue(0);
  const progress = useSharedValue(0);
  useEffect(() => {
    visibility.set(
      withDelay(
        Motion.progressDelay,
        withTiming(1, {
          duration: Motion.reveal,
          easing: Easing.out(Easing.ease),
        })
      )
    );
    progress.set(
      withRepeat(
        withTiming(1, {
          duration: Motion.progressSweepPeriod,
          easing: reduceMotion ? Easing.linear : Curves.progress,
        }),
        -1,
        reduceMotion
      )
    );
  }, [progress, reduceMotion, visibility]);
  const segment = width * SEGMENT_FRACTION;
  const animated = useAnimatedStyle(() => {
    if (reduceMotion) {
      return {
        opacity:
          visibility.get() *
          (REDUCED_MIN_OPACITY + (1 - REDUCED_MIN_OPACITY) * progress.get()),
        width,
      };
    }
    return {
      opacity: visibility.get(),
      transform: [
        { translateX: -segment + progress.get() * segment * SWEEP_SEGMENTS },
      ],
      width: segment,
    };
  });
  const fill =
    tone === undefined
      ? tokenColor("inkFill", FILL_OPACITY)
      : toneColors[tone].meter;
  return (
    <Animated.View
      style={[
        styles.capsule,
        { backgroundColor: fill, minWidth: thickness },
        animated,
      ]}
    />
  );
};

/**
 * A thin capsule bar for progressive loads and meters. Indeterminate (`value: null`) stays
 * invisible for 200 ms so quick refreshes are silent, then a 40% segment sweeps every 1.1 s;
 * Reduce Motion fades the full bar instead. Determinate fills a track.
 */
export const ProgressCapsule = (props: ProgressCapsuleProps) => {
  const { value, tone, spoken } = resolve(props);
  const thickness = props.thickness ?? Metrics.meterHeight;
  const [width, setWidth] = useState(0);
  const fillWidth = useSharedValue(0);
  useEffect(() => {
    if (value !== null) {
      fillWidth.set(
        withTiming(
          Math.max(width * value, value > 0 ? thickness : 0),
          snappy(FILL_DURATION)
        )
      );
    }
  }, [fillWidth, thickness, value, width]);
  const fillStyle = useAnimatedStyle(() => ({ width: fillWidth.get() }));
  const fill =
    tone === undefined
      ? tokenColor("inkFill", FILL_OPACITY)
      : toneColors[tone].meter;
  const track =
    tone === undefined
      ? tokenColor("inkFill", TRACK_OPACITY)
      : colors.surfaceMuted;
  return (
    <View
      accessibilityLabel={props.label ?? "Loading"}
      accessibilityRole="progressbar"
      accessibilityValue={{ text: spoken }}
      accessible
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
      style={[
        styles.track,
        {
          backgroundColor: value === null ? "transparent" : track,
          height: thickness,
        },
      ]}
    >
      {value === null && width > 0 ? (
        <Indeterminate thickness={thickness} tone={tone} width={width} />
      ) : null}
      {value === null ? null : (
        <Animated.View
          style={[styles.capsule, { backgroundColor: fill }, fillStyle]}
        />
      )}
    </View>
  );
};
