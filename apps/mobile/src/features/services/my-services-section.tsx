import {
  formatPlanDate,
  formatPlanRelativeDay,
} from "@pcobooster/planning-center-models/service-plans";
import type { ServicePlanRow } from "@pcobooster/planning-center-models/service-plans";
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

import { DateTile } from "../../components/date-tile";
import { PressScale } from "../../components/press-scale";
import { SectionHeader } from "../../components/section-header";
import { Skeleton } from "../../components/skeleton";
import { SurfaceCard } from "../../components/surface-card";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { Spacing } from "../../design/metrics";
import { useClock, useOrgTimeZone } from "../../lib/environment";

/** Cards are 80% of the row, at most 300 pt (Swift `containerRelativeFrame`). */
const CARD_FRACTION = 0.8;
const CARD_MAX_WIDTH = 300;
const SKELETON_CARD_HEIGHT = 84;
const SKELETON_CARDS = [0, 1, 2] as const;

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.md,
  },
  header: { paddingHorizontal: Spacing.lg + Spacing.xs },
  row: { gap: Spacing.md, paddingHorizontal: Spacing.lg },
  section: { gap: Spacing.sm + 2, paddingBottom: Spacing.lg },
  text: { flex: 1, gap: Spacing.xxs },
});

const MyServiceCard = ({
  row,
  width,
  onOpen,
}: {
  row: ServicePlanRow;
  width: number;
  onOpen: () => void;
}) => {
  const timeZone = useOrgTimeZone();
  const relativeDay = formatPlanRelativeDay(
    row.sortDate,
    useClock().now(),
    timeZone
  );
  const label = [
    relativeDay,
    row.serviceTypeName,
    formatPlanDate(row.sortDate, timeZone),
    row.planTitle,
  ]
    .filter((part) => part !== null && part !== "")
    .join(", ");
  return (
    <PressScale
      accessibilityLabel={label}
      onPress={onOpen}
      style={{ width }}
      testID={`my-service-${row.planId}`}
    >
      <SurfaceCard contentStyle={styles.card} padding="compact">
        <DateTile date={row.sortDate} />
        <View style={styles.text}>
          {relativeDay === null ? null : (
            <AppText
              color={colors.statusConfirmedText}
              font="footnote"
              numberOfLines={1}
              weight="semibold"
            >
              {relativeDay}
            </AppText>
          )}
          <AppText font="rowTitleEmphasized" numberOfLines={1}>
            {row.serviceTypeName}
          </AppText>
          {row.planTitle === "" ? null : (
            <AppText
              color={colors.inkSecondary}
              ellipsizeMode="middle"
              font="rowDetail"
              numberOfLines={1}
            >
              {row.planTitle}
            </AppText>
          )}
        </View>
      </SurfaceCard>
    </PressScale>
  );
};

interface MyServicesSectionProps {
  readonly rows: readonly ServicePlanRow[];
  readonly isLoading: boolean;
  readonly onOpen: (row: ServicePlanRow) => void;
}

/**
 * "Your services": upcoming plans the signed-in person is on, as cards with the date tile and a
 * relative day, in a row that snaps card by card. Hidden when there are none.
 */
export const MyServicesSection = ({
  rows,
  isLoading,
  onOpen,
}: MyServicesSectionProps) => {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(
    CARD_MAX_WIDTH,
    (width - Spacing.lg * 2) * CARD_FRACTION
  );
  if (!isLoading && rows.length === 0) {
    return null;
  }
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <SectionHeader
          count={isLoading ? undefined : rows.length}
          title="Your services"
        />
      </View>
      <ScrollView
        contentContainerStyle={styles.row}
        decelerationRate="fast"
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + Spacing.md}
      >
        {isLoading
          ? SKELETON_CARDS.map((index) => (
              <View key={index} style={{ width: cardWidth }}>
                <Skeleton height={SKELETON_CARD_HEIGHT} variant="block" />
              </View>
            ))
          : rows.map((row) => (
              <MyServiceCard
                key={row.planId}
                onOpen={() => {
                  onOpen(row);
                }}
                row={row}
                width={cardWidth}
              />
            ))}
      </ScrollView>
    </View>
  );
};
