import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "../design/app-text";
import { colors, tokenColor } from "../design/colors";
import { Radius, Spacing } from "../design/metrics";
import { fontSize } from "../design/typography";
import { Glyph } from "./glyph";

const DESTRUCTIVE_FILL_OPACITY = 0.08;
const DESTRUCTIVE_BORDER_OPACITY = 0.25;

const tones = {
  info: {
    symbol: "info",
    icon: colors.statusInfo,
    fill: colors.infoSurface,
    border: colors.infoBorder,
  },
  destructive: {
    symbol: "alert",
    icon: colors.destructive,
    fill: tokenColor("destructive", DESTRUCTIVE_FILL_OPACITY),
    border: tokenColor("destructive", DESTRUCTIVE_BORDER_OPACITY),
  },
} as const;

const styles = StyleSheet.create({
  banner: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: Radius.inner,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: Spacing.md,
    padding: Spacing.md,
  },
  message: { flex: 1 },
});

interface InfoBannerProps {
  readonly message: string;
  readonly tone?: keyof typeof tones;
  /** One small action, such as a "Retry" `PillButton` (outline, small). */
  readonly action?: ReactNode;
}

/**
 * An inline notice inside content, like the web `Alert`: a tone icon and one or two lines on a
 * soft solid fill with a hairline outline. Keep it short and rare.
 */
export const InfoBanner = ({
  message,
  tone = "info",
  action,
}: InfoBannerProps) => {
  const style = tones[tone];
  return (
    <View
      accessibilityRole={tone === "destructive" ? "alert" : "summary"}
      style={[
        styles.banner,
        { backgroundColor: style.fill, borderColor: style.border },
      ]}
    >
      <Glyph
        color={style.icon}
        size={fontSize("rowDetail")}
        symbol={style.symbol}
      />
      <AppText font="rowDetail" style={styles.message}>
        {message}
      </AppText>
      {action ?? null}
    </View>
  );
};
