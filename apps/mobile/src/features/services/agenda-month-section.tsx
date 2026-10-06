import type {
  PlanMonthGroup,
  ServicePlanRow,
} from "@pcobooster/planning-center-models/service-plans";
import { Fragment } from "react";
import { StyleSheet, View } from "react-native";

import { useDateTileWidth } from "../../components/date-tile";
import { Hairline } from "../../components/hairline";
import { SurfaceCard } from "../../components/surface-card";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { Spacing } from "../../design/metrics";
import { AgendaPlanRow } from "./agenda-plan-row";

const styles = StyleSheet.create({
  card: { marginBottom: Spacing.lg, marginHorizontal: Spacing.lg },
  heading: {
    backgroundColor: colors.surfaceCanvas,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.lg + Spacing.xs,
    paddingTop: Spacing.md,
  },
});

/** "October 2026", pinned while its month scrolls. */
export const AgendaMonthHeading = ({ title }: { title: string }) => (
  <View style={styles.heading}>
    <AppText
      accessibilityRole="header"
      color={colors.inkSecondary}
      font="sectionLabel"
      numberOfLines={1}
    >
      {title}
    </AppText>
  </View>
);

interface AgendaMonthCardProps {
  readonly month: PlanMonthGroup;
  readonly todayKey: string;
  readonly myPlanIds: ReadonlySet<string>;
  readonly onOpen: (row: ServicePlanRow) => void;
}

/** One organization month's days in one card, divided by hairlines (iPhone layout). */
export const AgendaMonthCard = ({
  month,
  todayKey,
  myPlanIds,
  onOpen,
}: AgendaMonthCardProps) => {
  const tileWidth = useDateTileWidth();
  return (
    <SurfaceCard padding="none" style={styles.card}>
      {month.days.map((day, dayIndex) => (
        <Fragment key={day.dayKey}>
          {dayIndex > 0 ? (
            <Hairline color={colors.hairlineSubtle} inset={Spacing.lg} />
          ) : null}
          {day.rows.map((row, index) => (
            <Fragment key={row.planId}>
              {index > 0 ? (
                <Hairline
                  color={colors.hairlineSubtle}
                  inset={Spacing.lg + tileWidth + Spacing.md}
                />
              ) : null}
              <AgendaPlanRow
                isScheduled={myPlanIds.has(row.planId)}
                isToday={day.dayKey === todayKey}
                onOpen={() => {
                  onOpen(row);
                }}
                row={row}
                showsTile={index === 0}
              />
            </Fragment>
          ))}
        </Fragment>
      ))}
    </SurfaceCard>
  );
};
