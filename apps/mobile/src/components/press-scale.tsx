import { useState } from "react";
import type { ReactNode } from "react";
import { Pressable } from "react-native";
import type { AccessibilityProps, StyleProp, ViewStyle } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { CssCurves } from "../design/motion";
import { Motion } from "../design/motion-tokens";

const PRESSED_SCALE = 0.97;

interface PressScaleProps extends AccessibilityProps {
  readonly children: ReactNode;
  readonly onPress: () => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/**
 * Press feedback that moves, never recolors: scales to 0.97 on press (Swift
 * `MyServiceCardButtonStyle`, snappy 180 ms). Reduce Motion keeps it still.
 */
export const PressScale = ({
  children,
  onPress,
  style,
  testID,
  ...accessibility
}: PressScaleProps) => {
  const [pressed, setPressed] = useState(false);
  const reduceMotion = useReducedMotion();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => {
        setPressed(true);
      }}
      onPressOut={() => {
        setPressed(false);
      }}
      style={style}
      testID={testID}
      {...accessibility}
    >
      <Animated.View
        style={{
          transform: [{ scale: pressed && !reduceMotion ? PRESSED_SCALE : 1 }],
          transitionDuration: reduceMotion ? 0 : Motion.pressCard,
          transitionProperty: "transform",
          transitionTimingFunction: CssCurves.snappy,
        }}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
};
