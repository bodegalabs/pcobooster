import { groupRankingReasons } from "@pcobooster/planning-center-models/ranking-reasons";
import { buildScheduleDays } from "@pcobooster/planning-center-models/schedule-days";
import type { PersonWithAvailability } from "@pcobooster/planning-center-models/types";
import { StyleSheet, View } from "react-native";

import { Glyph } from "../../components/glyph";
import { Hairline } from "../../components/hairline";
import { PersonAvatar } from "../../components/person-avatar";
import { StatusBadge } from "../../components/status-badge";
import { SurfaceColorProvider } from "../../components/surface-card";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { DayBars } from "./day-bars";
import { fitTone, rankingSymbol } from "./presentation";
import type { CandidatePresentation } from "./presentation";

const PREVIEW_WIDTH = 340;
const PREVIEW_REASONS = 3;
const styles = StyleSheet.create({
  card: {
    width: PREVIEW_WIDTH,
    padding: 16,
    gap: 12,
    backgroundColor: colors.surfaceCard,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  reason: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
});

const StateBadge = ({
  presentation,
}: {
  presentation: CandidatePresentation;
}) => {
  if (presentation.blocked) {
    return <StatusBadge title="Blocked" tone="pending" symbol="locked" />;
  }
  if (presentation.status !== undefined) {
    return <StatusBadge status={presentation.status} />;
  }
  return presentation.score === undefined ? null : (
    <StatusBadge
      title={`${presentation.score} fit`}
      tone={fitTone(presentation.score)}
    />
  );
};

/**
 * The long-press preview of a candidate (Swift `AssignCandidatePreviewCard`): who they are,
 * where they stand on this slot, the facts line in full, their days around the plan, and the
 * top reasons for their ranking.
 */
export const CandidatePreview = ({
  person,
  presentation,
  positionName,
  date,
  zone,
}: {
  person: PersonWithAvailability;
  presentation: CandidatePresentation;
  positionName: string;
  date: Date;
  zone: string;
}) => {
  const reasons = groupRankingReasons(
    person.recommendationReasoning ?? []
  ).slice(0, PREVIEW_REASONS);
  return (
    <SurfaceColorProvider value="surfaceCard">
      <View style={styles.card}>
        <View style={styles.header}>
          <PersonAvatar
            name={person.fullName}
            size="large"
            photoUrl={person.photoThumbnailUrl}
            status={presentation.status}
            alsoScheduled={presentation.others.length > 0}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText font="cardTitle" numberOfLines={1}>
              {person.fullName}
            </AppText>
            <AppText font="meta" color={colors.inkSecondary} numberOfLines={1}>
              {positionName}
            </AppText>
          </View>
          <StateBadge presentation={presentation} />
        </View>
        {presentation.facts.length === 0 ? null : (
          <AppText font="rowDetail" color={colors.inkSecondary}>
            {presentation.facts.join(" · ")}
          </AppText>
        )}
        {person.serviceHistory === undefined ? null : (
          <DayBars
            days={buildScheduleDays(person.serviceHistory, date, zone)}
          />
        )}
        {presentation.showsFit && reasons.length > 0 ? (
          <>
            <Hairline />
            {reasons.map((fact) => (
              <View key={fact.text} style={styles.reason}>
                <Glyph
                  symbol={rankingSymbol[fact.kind]}
                  size={14}
                  color={
                    fact.kind === "load"
                      ? colors.statusPendingText
                      : colors.inkSecondary
                  }
                />
                <AppText font="meta" style={{ flex: 1 }}>
                  {fact.text}
                </AppText>
              </View>
            ))}
          </>
        ) : null}
      </View>
    </SurfaceColorProvider>
  );
};
