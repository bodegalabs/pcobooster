import type { ColorValue } from "react-native";
import { View } from "react-native";

/**
 * A dashed circle outline like SwiftUI's `Circle().strokeBorder(style: StrokeStyle(dash:))`.
 * React Native's `borderStyle: "dashed"` draws two or three uneven dashes on small circles, so
 * this lays the dashes out by hand around the inset radius.
 */
export const DashedCircle = ({
  size,
  lineWidth,
  dash,
  gap,
  color,
}: {
  size: number;
  lineWidth: number;
  dash: number;
  gap: number;
  color: ColorValue;
}) => {
  const radius = (size - lineWidth) / 2;
  const count = Math.max(4, Math.round((2 * Math.PI * radius) / (dash + gap)));
  // Core Graphics starts a circle's stroke at 3 o'clock, so the first dash begins there.
  const start = 90 + ((dash / 2 / radius) * 180) / Math.PI;
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      {Array.from({ length: count }, (_, index) => {
        const angle = start + (index / count) * 360;
        return (
          <View
            key={angle}
            style={{
              position: "absolute",
              left: size / 2 - dash / 2,
              top: size / 2 - lineWidth / 2,
              width: dash,
              height: lineWidth,
              backgroundColor: color,
              borderRadius: lineWidth / 2,
              transform: [{ rotate: `${angle}deg` }, { translateY: -radius }],
            }}
          />
        );
      })}
    </View>
  );
};
