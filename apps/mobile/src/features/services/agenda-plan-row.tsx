import {
  formatPlanDate,
  formatPlanDetail,
} from "@pcobooster/planning-center-models/service-plans";
import type { ServicePlanRow } from "@pcobooster/planning-center-models/service-plans";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";

import { DateTile } from "../../components/date-tile";
import { Glyph } from "../../components/glyph";
import { StatusDot } from "../../components/status-dot";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { Spacing } from "../../design/metrics";
import { toneColors } from "../../design/status";
import { useOrgTimeZone } from "../../lib/environment";

/** Text sizes from here up are accessibility sizes (Swift `isAccessibilitySize`). */
const ACCESSIBILITY_FONT_SCALE = 1.6;
const ROW_MIN_HEIGHT = 68;
const MARK_DOT = 6;
const CHEVRON_WIDTH = 8;

const styles = StyleSheet.create({
  mark: {
    alignItems: "center",
    backgroundColor: toneColors.confirmed.fill,
    borderRadius: 999,
    flexDirection: "row",
    gap: Spacing.xs + 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs + 1,
  },
  markDot: {
    backgroundColor: colors.statusConfirmed,
    borderRadius: MARK_DOT / 2,
    height: MARK_DOT,
    width: MARK_DOT,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.md,
    minHeight: ROW_MIN_HEIGHT,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
  },
  text: { flex: 1, gap: Spacing.xxs },
});

/** "You're on": a soft green capsule, or just the dot where room is short. */
const ScheduledMark = ({ compact }: { compact: boolean }) =>
  compact ? (
    <StatusDot size={8} tone="confirmed" />
  ) : (
    <View style={styles.mark}>
      <View style={styles.markDot} />
      <AppText
        color={colors.statusConfirmedText}
        font="badgeLabel"
        numberOfLines={1}
      >
        You&apos;re on
      </AppText>
    </View>
  );

interface AgendaPlanRowProps {
  readonly row: ServicePlanRow;
  /** The day's first row carries the date tile; later rows keep its space. */
  readonly showsTile: boolean;
  readonly isToday: boolean;
  readonly isScheduled: boolean;
  readonly onOpen: () => void;
}

/**
 * One plan in the agenda: the day's tile, the service type, the plan and series titles, and
 * "You're on" when the signed-in person is scheduled. The pressed fill shows instantly.
 */
export const AgendaPlanRow = ({
  row,
  showsTile,
  isToday,
  isScheduled,
  onOpen,
}: AgendaPlanRowProps) => {
  const timeZone = useOrgTimeZone();
  const isAccessibilitySize =
    useWindowDimensions().fontScale >= ACCESSIBILITY_FONT_SCALE;
  const lines = isAccessibilitySize ? 3 : 1;
  const detail = formatPlanDetail(row);
  const label = [
    row.serviceTypeName,
    formatPlanDate(row.sortDate, timeZone),
    detail,
    isScheduled ? "you're scheduled" : null,
  ]
    .filter((part) => part !== null)
    .join(", ");
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: colors.surfaceHighlight } : null,
      ]}
      testID={`agenda-row-${row.planId}`}
    >
      <DateTile date={row.sortDate} hidden={!showsTile} isToday={isToday} />
      <View style={styles.text}>
        <AppText font="rowTitleEmphasized" numberOfLines={lines}>
          {row.serviceTypeName}
        </AppText>
        {detail === null ? null : (
          <AppText
            color={colors.inkSecondary}
            ellipsizeMode="middle"
            font="rowDetail"
            numberOfLines={lines}
          >
            {detail}
          </AppText>
        )}
      </View>
      {isScheduled ? <ScheduledMark compact={isAccessibilitySize} /> : null}
      <Glyph
        color={colors.inkTertiary}
        size={13}
        symbol="chevronRight"
        weight="semibold"
        width={CHEVRON_WIDTH}
      />
    </Pressable>
  );
};
