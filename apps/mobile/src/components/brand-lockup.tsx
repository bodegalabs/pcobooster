import { StyleSheet, Text, View } from "react-native";

import { colors } from "../design/colors";
import { Spacing } from "../design/metrics";
import { textStyles } from "../design/typography";
import { RocketMark } from "./rocket-mark";

const wordmarkSizes = {
  /** Toolbar and sidebar size (web 16 px): headline size, regular weight. */
  regular: {
    style: textStyles.headline,
    tracking: -0.2,
    rocket: 28,
    gap: Spacing.sm,
  },
  /** Sign-in hero size (web 24 px, tracking tight): title 2. */
  large: { style: textStyles.title2, tracking: -0.6, rocket: 40, gap: 10 },
} as const;

export type WordmarkSize = keyof typeof wordmarkSizes;

const styles = StyleSheet.create({
  bold: { fontWeight: "700" },
  lockup: { alignItems: "center", flexDirection: "row" },
});

/** "PCOBooster": bold "PCO" and regular "Booster", the in-product mark. Not localized. */
export const Wordmark = ({ size = "regular" }: { size?: WordmarkSize }) => {
  const metrics = wordmarkSizes[size];
  return (
    <Text
      accessibilityLabel="PCOBooster"
      dynamicTypeRamp={metrics.style.ramp}
      numberOfLines={1}
      style={{
        color: colors.ink,
        fontSize: metrics.style.fontSize,
        fontWeight: "400",
        letterSpacing: metrics.tracking,
      }}
    >
      <Text style={styles.bold}>PCO</Text>Booster
    </Text>
  );
};

interface BrandLockupProps {
  readonly size?: WordmarkSize;
  readonly playsTakeoffOnAppear?: boolean;
  readonly isLaunching?: boolean;
}

/** The wordmark beside the rocket, as on the web sidebar and sign-in screen. */
export const BrandLockup = ({
  size = "regular",
  playsTakeoffOnAppear = false,
  isLaunching = false,
}: BrandLockupProps) => {
  const metrics = wordmarkSizes[size];
  return (
    <View
      accessibilityLabel="PCOBooster"
      accessibilityRole="image"
      accessible
      style={[styles.lockup, { gap: metrics.gap }]}
    >
      <Wordmark size={size} />
      <RocketMark
        isLaunching={isLaunching}
        playsTakeoffOnAppear={playsTakeoffOnAppear}
        replaysOnTap
        size={metrics.rocket}
      />
    </View>
  );
};
