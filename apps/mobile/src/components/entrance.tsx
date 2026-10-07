import { useEffect } from "react";
import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { snappy } from "../design/motion";
import { Motion } from "../design/motion-tokens";

interface EntranceProps {
  readonly index: number;
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The sign-in entrance (Swift `.entrance(index:isVisible:)`): each child rises 8 pt and fades in
 * over 360 ms, 60 ms after the one before. Reduce Motion fades without the rise.
 */
export const Entrance = ({ index, children, style }: EntranceProps) => {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(
      withDelay(
        index * Motion.entranceStagger,
        withTiming(1, snappy(Motion.entrance))
      )
    );
  }, [index, progress]);
  const animated = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [
      {
        translateY: reduceMotion
          ? 0
          : (1 - progress.get()) * Motion.entranceRise,
      },
    ],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
};
