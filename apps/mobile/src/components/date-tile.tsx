import { formatPlanDateTile } from "@pcobooster/planning-center-models/service-plans";
import { StyleSheet, View, useWindowDimensions } from "react-native";

import { AppText } from "../design/app-text";
import { colors } from "../design/colors";
import { Metrics, Radius, Spacing } from "../design/metrics";
import { useOrgTimeZone } from "../lib/environment";

/** The tile grows with the text size up to this width (Swift `min(@ScaledMetric 48, 72)`). */
const MAX_TILE_WIDTH = 72;
/** Text shrinks this far before the tile clips it (Swift `minimumScaleFactor(0.8)`). */
const MINIMUM_FONT_SCALE = 0.8;

const fit = {
  adjustsFontSizeToFit: true,
  minimumFontScale: MINIMUM_FONT_SCALE,
  numberOfLines: 1,
} as const;

/** The tile's width at the current text size, for insets that line up with it. */
export const useDateTileWidth = (): number => {
  const { fontScale } = useWindowDimensions();
  return Math.min(Metrics.dateTileWidth * fontScale, MAX_TILE_WIDTH);
};

const styles = StyleSheet.create({
  month: { letterSpacing: 0.4, opacity: 0.72, textTransform: "uppercase" },
  tile: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: Radius.tile,
    gap: 1,
    paddingVertical: Spacing.xs + 2,
  },
  weekday: { opacity: 0.62 },
});

interface DateTileProps {
  readonly date: Date;
  /** Today's tile is inverted. */
  readonly isToday?: boolean;
  /** Keeps the tile's space without drawing it (later rows of the same day). */
  readonly hidden?: boolean;
}

/**
 * A plan's date as a small tile: month, day, and weekday on the organization calendar. Today is
 * inverted. Decorative: rows speak the full date.
 */
export const DateTile = ({
  date,
  isToday = false,
  hidden = false,
}: DateTileProps) => {
  const tile = formatPlanDateTile(date, useOrgTimeZone());
  const ink = isToday ? colors.onInkFill : colors.ink;
  const width = useDateTileWidth();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.tile,
        {
          backgroundColor: isToday ? colors.inkFill : colors.surfaceMuted,
          opacity: hidden ? 0 : 1,
          width,
        },
      ]}
    >
      <AppText
        color={ink}
        font="caption2"
        {...fit}
        style={styles.month}
        weight="semibold"
      >
        {tile.month}
      </AppText>
      <AppText color={ink} font="title3" {...fit} tabular weight="semibold">
        {tile.day}
      </AppText>
      <AppText
        color={ink}
        font="caption2"
        {...fit}
        style={styles.weekday}
        weight="medium"
      >
        {tile.weekday}
      </AppText>
    </View>
  );
};
