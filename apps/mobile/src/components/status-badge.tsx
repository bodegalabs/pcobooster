import { StyleSheet, View } from "react-native";

import { AppText } from "../design/app-text";
import { colors } from "../design/colors";
import { Radius, Spacing } from "../design/metrics";
import { scheduleStatusLabel, toneColors } from "../design/status";
import type { ScheduleStatus, StatusTone } from "../design/status";
import type { AppSymbolName } from "../design/symbols";
import { capsLabelStyle, fontSize } from "../design/typography";
import { Glyph } from "./glyph";
import { StatusDot } from "./status-dot";

const styles = StyleSheet.create({
  capsule: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: Radius.capsule,
    flexDirection: "row",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs + 1,
  },
  dotGap: { gap: Spacing.xs + 1 },
  labelGap: { gap: Spacing.xs },
});

/** The small symbol beside a badge label (`imageScale(.small)` at caption size). */
const BADGE_SYMBOL_SCALE = 0.8;
const BADGE_DOT_SIZE = 7;

type StatusBadgeProps = (
  | { readonly status: ScheduleStatus }
  | {
      readonly title: string;
      readonly tone: StatusTone;
      readonly symbol?: AppSymbolName;
    }
) & {
  /**
   * `tinted`: text-safe tone on a soft tone fill. `plain`: small caps tone text, no fill, for
   * row trailing labels such as "DECLINED". `dot`: a status dot on a quiet fill.
   */
  readonly variant?: "tinted" | "plain" | "dot";
};

/**
 * A compact status chip: "Confirmed", "You're on", "Limited", "Declined". Keep badges rare: one
 * per row at most (low-noise rule).
 */
export const StatusBadge = (props: StatusBadgeProps) => {
  const variant = props.variant ?? "tinted";
  const isStatus = "status" in props;
  const title = isStatus ? scheduleStatusLabel[props.status] : props.title;
  const tone: StatusTone = isStatus ? props.status : props.tone;
  const symbol = isStatus ? undefined : props.symbol;
  const tones = toneColors[tone];

  if (variant === "plain") {
    return (
      <AppText
        color={tones.text}
        font="capsLabel"
        numberOfLines={1}
        style={capsLabelStyle}
      >
        {title}
      </AppText>
    );
  }
  if (variant === "dot") {
    return (
      <View
        style={[
          styles.capsule,
          styles.dotGap,
          { backgroundColor: colors.surfaceMuted },
        ]}
      >
        <StatusDot pulses={false} size={BADGE_DOT_SIZE} tone={tone} />
        <AppText font="badgeLabel" numberOfLines={1}>
          {title}
        </AppText>
      </View>
    );
  }
  const symbolSize = fontSize("badgeLabel") * BADGE_SYMBOL_SCALE;
  return (
    <View
      style={[styles.capsule, styles.labelGap, { backgroundColor: tones.fill }]}
    >
      {symbol === undefined ? null : (
        <Glyph color={tones.text} size={symbolSize} symbol={symbol} />
      )}
      <AppText color={tones.text} font="badgeLabel" numberOfLines={1}>
        {title}
      </AppText>
    </View>
  );
};
