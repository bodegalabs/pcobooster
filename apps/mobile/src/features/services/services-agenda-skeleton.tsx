import { Fragment } from "react";
import { StyleSheet, View } from "react-native";

import { Hairline } from "../../components/hairline";
import { Skeleton } from "../../components/skeleton";
import { SurfaceCard } from "../../components/surface-card";
import { colors } from "../../design/colors";
import { Metrics, Spacing } from "../../design/metrics";

/** Placeholder days and their rows (the web's `PlanAgendaSkeleton`). */
const PLACEHOLDER_DAYS = [
  { id: "first", rows: ["a", "b"] },
  { id: "second", rows: ["a"] },
  { id: "third", rows: ["a", "b", "c"] },
  { id: "fourth", rows: ["a"] },
  { id: "fifth", rows: ["a", "b"] },
  { id: "sixth", rows: ["a"] },
] as const;
const TILE_HEIGHT = 60;
const TITLE_WIDTHS = [140, 120] as const;
const DETAIL_WIDTHS = [190, 160] as const;

const styles = StyleSheet.create({
  card: { marginHorizontal: Spacing.lg },
  day: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  heading: {
    paddingHorizontal: Spacing.lg + Spacing.xs,
    paddingTop: Spacing.md,
  },
  line: {
    gap: Spacing.sm,
    justifyContent: "center",
    minHeight: Metrics.minimumTapTarget,
  },
  lines: { flex: 1, gap: Spacing.lg },
  root: { gap: Spacing.sm },
});

/** The agenda before its first answers: a month heading and a card of placeholder days. */
export const ServicesAgendaSkeleton = () => (
  <View
    accessibilityLabel="Loading plans"
    accessible
    style={styles.root}
    testID="services-skeleton"
  >
    <View style={styles.heading}>
      <Skeleton height={12} variant="text" width={110} />
    </View>
    <SurfaceCard padding="none" style={styles.card}>
      {PLACEHOLDER_DAYS.map((day, dayIndex) => (
        <Fragment key={day.id}>
          {dayIndex > 0 ? (
            <Hairline color={colors.hairlineSubtle} inset={Spacing.lg} />
          ) : null}
          <View style={styles.day}>
            <Skeleton
              height={TILE_HEIGHT}
              variant="block"
              width={Metrics.dateTileWidth}
            />
            <View style={styles.lines}>
              {day.rows.map((row, rowIndex) => (
                <View key={row} style={styles.line}>
                  <Skeleton
                    height={12}
                    variant="text"
                    width={TITLE_WIDTHS[rowIndex % 2]}
                  />
                  <Skeleton
                    height={10}
                    variant="text"
                    width={DETAIL_WIDTHS[rowIndex % 2]}
                  />
                </View>
              ))}
            </View>
          </View>
        </Fragment>
      ))}
    </SurfaceCard>
  </View>
);
