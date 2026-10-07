import {
  ImpactFeedbackStyle,
  NotificationFeedbackType,
  impactAsync,
  notificationAsync,
  selectionAsync,
} from "expo-haptics";
import { useEffect, useRef } from "react";

/** The product's haptic vocabulary. Success feedback replaces success toasts. */
export type Haptic =
  /** An assignment was added or confirmed; a write finished. */
  | "success"
  /** A status changed or a segment or plan view was switched. */
  | "selection"
  /** A reorder drop, a rocket tap, a small physical moment. */
  | "tap"
  /** A decline, or an action that needs a second look. */
  | "warning"
  /** A write failed (error toasts play this themselves). */
  | "error";

const play = async (haptic: Haptic): Promise<void> => {
  switch (haptic) {
    case "success": {
      await notificationAsync(NotificationFeedbackType.Success);
      return;
    }
    case "selection": {
      await selectionAsync();
      return;
    }
    case "tap": {
      await impactAsync(ImpactFeedbackStyle.Light);
      return;
    }
    case "warning": {
      await notificationAsync(NotificationFeedbackType.Warning);
      return;
    }
    case "error": {
      await notificationAsync(NotificationFeedbackType.Error);
      return;
    }
    default: {
      haptic satisfies never;
    }
  }
};

/** Plays `haptic` now. Haptics are best effort: a device without a haptic engine stays silent. */
export const playHaptic = (haptic: Haptic): void => {
  void (async () => {
    try {
      await play(haptic);
    } catch {
      // No haptic engine (the simulator, an older iPad): feedback is decorative.
    }
  })();
};

/**
 * Plays `haptic` whenever `trigger` changes after the first render (Swift
 * `.haptic(_:trigger:)`). Pass `when` to play only for some changes.
 */
export const useHaptic = <T>(
  haptic: Haptic,
  trigger: T,
  when: (previous: T, next: T) => boolean = () => true
): void => {
  const previous = useRef(trigger);
  useEffect(() => {
    const before = previous.current;
    previous.current = trigger;
    if (!Object.is(before, trigger) && when(before, trigger)) {
      playHaptic(haptic);
    }
  }, [haptic, trigger, when]);
};
