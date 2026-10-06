import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
} from "react-native-reanimated";

import { Metrics } from "../design/metrics";
import { pulsePhase } from "../design/motion";
import { scheduleStatusLabel, toneColors } from "../design/status";
import type { ScheduleStatus, StatusTone } from "../design/status";

/** How far a pulse dims and shrinks at its peak (web: opacity 1 to 0.72, scale 1 to 0.9). */
const PULSE_OPACITY = 0.28;
const PULSE_SCALE = 0.1;

type StatusDotProps =
  | {
      /** A schedule status; live status dots pulse by default. */
      readonly status: ScheduleStatus;
      readonly size?: number;
      readonly pulses?: boolean;
    }
  | {
      readonly tone: StatusTone;
      /** Spoken by VoiceOver; decorative without one. */
      readonly label?: string;
      readonly size?: number;
      readonly pulses?: boolean;
    };

/**
 * A small status dot. Live dots pulse gently, and every dot on screen shares one phase because
 * the pulse is computed from the clock. Reduce Motion, or `pulses: false`, keeps it still.
 * Pulse only dots that stand for live status (a roster's status column), not every badge.
 */
export const StatusDot = (props: StatusDotProps) => {
  const isStatus = "status" in props;
  const tone: StatusTone = isStatus ? props.status : props.tone;
  const label = isStatus ? scheduleStatusLabel[props.status] : props.label;
  const size = props.size ?? Metrics.statusDot;
  const reduceMotion = useReducedMotion();
  const animates = (props.pulses ?? isStatus) && !reduceMotion;
  const phase = useSharedValue(0);
  useFrameCallback(() => {
    phase.set(pulsePhase(Date.now()));
  }, animates);
  const pulse = useAnimatedStyle(() => ({
    opacity: animates ? 1 - PULSE_OPACITY * phase.get() : 1,
    transform: [{ scale: animates ? 1 - PULSE_SCALE * phase.get() : 1 }],
  }));
  return (
    <Animated.View
      accessibilityElementsHidden={label === undefined}
      accessibilityLabel={label}
      accessible={label !== undefined}
      style={[
        {
          backgroundColor: toneColors[tone].color,
          borderRadius: size / 2,
          height: size,
          width: size,
        },
        pulse,
      ]}
    />
  );
};
