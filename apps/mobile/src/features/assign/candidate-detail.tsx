import { formatCalendarDateLabel } from "@pcobooster/planning-center-models/calendar";
import { groupRankingReasons } from "@pcobooster/planning-center-models/ranking-reasons";
import { buildScheduleDays } from "@pcobooster/planning-center-models/schedule-days";
import type { PersonWithAvailability } from "@pcobooster/planning-center-models/types";
import { useRouter } from "expo-router";
import { Modal, ScrollView, StyleSheet, View } from "react-native";

import { BottomActionBar } from "../../components/bottom-action-bar";
import { PersonAvatar } from "../../components/person-avatar";
import { PillButton } from "../../components/pill-button";
import { StatusBadge } from "../../components/status-badge";
import { SurfaceCard } from "../../components/surface-card";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { useOpenPlanningCenterPerson } from "../plan/roster-links";
import { FitScore } from "./candidate-row";
import { DayBars } from "./day-bars";
import {
  candidatePresentation,
  fitTone,
  preferenceLines,
} from "./presentation";
import type { CandidatePresentation, ResolvedSlot } from "./presentation";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceCanvas },
  content: { padding: 16, gap: 20 },
});
const declineMessage = (note: string | null | undefined): string => {
  const trimmed = note?.trim() ?? "";
  return trimmed === ""
    ? "No note was saved with this decline in Planning Center."
    : trimmed;
};
/** Blocked, their status on the slot, or their fit, as Swift's `stateBadge`. */
const HeaderBadge = ({
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
export const CandidateDetail = ({
  person,
  slot,
  date,
  zone,
  visible,
  busy,
  notNotified,
  canSchedule,
  showsPersonLink,
  onClose,
  onAdd,
  onStatus,
  onRemove,
}: {
  person: PersonWithAvailability;
  slot: ResolvedSlot;
  date: Date;
  zone: string;
  visible: boolean;
  busy: boolean;
  notNotified: boolean;
  canSchedule: boolean;
  showsPersonLink: boolean;
  onClose: () => void;
  onAdd: () => void;
  onStatus: () => void;
  onRemove: () => void;
}) => {
  const presentation = candidatePresentation(person, slot, date, zone);
  const router = useRouter();
  const openPlanningCenterPerson = useOpenPlanningCenterPerson();
  const declineReason = declineMessage(person.selectedPlanDeclineReason);
  const { frequency } = person;
  const preferences =
    person.schedulingPreferences === null ||
    person.schedulingPreferences === undefined
      ? []
      : preferenceLines(person.schedulingPreferences);
  const label = (value: Date | undefined) =>
    value === undefined
      ? "None"
      : formatCalendarDateLabel(value, zone, "monthDay");
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.root} testID="assign-candidate-detail">
        <ScrollView contentContainerStyle={styles.content}>
          <View
            style={{
              flexDirection: "row",
              gap: 16,
              alignItems: "center",
              marginTop: 16,
            }}
          >
            <PersonAvatar
              name={person.fullName}
              size="hero"
              photoUrl={person.photoThumbnailUrl}
              status={presentation.status}
              alsoScheduled={presentation.others.length > 0}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <AppText font="pageTitle">{person.fullName}</AppText>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <HeaderBadge presentation={presentation} />
                {notNotified ? (
                  <StatusBadge
                    title="Not notified"
                    tone="neutral"
                    symbol="mail"
                  />
                ) : null}
              </View>
              {presentation.others.length > 0 ? (
                <AppText
                  font="meta"
                  color={colors.statusInfoText}
                >{`Also on ${presentation.others.join(", ")}`}</AppText>
              ) : null}
            </View>
          </View>
          {presentation.declined ? (
            <SurfaceCard>
              <AppText font="sectionLabel">Decline reason</AppText>
              <AppText font="rowDetail">{declineReason}</AppText>
            </SurfaceCard>
          ) : null}
          {presentation.blocked ? (
            <SurfaceCard>
              <AppText font="sectionLabel">Blocked out</AppText>
              <AppText font="rowDetail">{`Planning Center has a blockout for ${formatCalendarDateLabel(date, zone, "weekdayMonthDay")}.`}</AppText>
            </SurfaceCard>
          ) : null}
          <SurfaceCard>
            <AppText font="sectionLabel" color={colors.inkSecondary}>
              Around this plan
            </AppText>
            <DayBars
              large
              days={buildScheduleDays(person.serviceHistory ?? [], date, zone)}
            />
            <AppText font="meta" color={colors.inkSecondary}>
              Tap a bar to see that day.
            </AppText>
          </SurfaceCard>
          {frequency === undefined ? null : (
            <SurfaceCard>
              <AppText font="sectionLabel" color={colors.inkSecondary}>
                Serving
              </AppText>
              <View style={{ flexDirection: "row", gap: 16 }}>
                <View style={{ flex: 1 }}>
                  <AppText font="title3" weight="semibold">
                    {frequency.recentServedDays}
                  </AppText>
                  <AppText font="meta" color={colors.inkSecondary}>
                    Services in the 4 weeks before
                  </AppText>
                  <AppText
                    font="caption2"
                    color={colors.inkTertiary}
                  >{`plus ${frequency.recentRehearsalOnlyDays} rehearsals`}</AppText>
                </View>
                <View style={{ flex: 1 }}>
                  <AppText font="title3" weight="semibold">
                    {frequency.upcomingServices}
                  </AppText>
                  <AppText font="meta" color={colors.inkSecondary}>
                    Services in the 4 weeks after
                  </AppText>
                  <AppText
                    font="caption2"
                    color={colors.inkTertiary}
                  >{`plus ${frequency.upcomingRehearsals} rehearsals`}</AppText>
                </View>
              </View>
              <AppText font="rowDetail">{`Last served ${label(frequency.lastServedDate)} · Next serving ${label(frequency.nextUpcomingDate)}`}</AppText>
            </SurfaceCard>
          )}
          {presentation.showsFit && presentation.score !== undefined ? (
            <SurfaceCard>
              <AppText font="sectionLabel" color={colors.inkSecondary}>
                Why this ranking
              </AppText>
              <StatusBadge
                title={`${presentation.score} fit`}
                tone={fitTone(presentation.score)}
              />
              <FitScore score={presentation.score} />
              {groupRankingReasons(person.recommendationReasoning ?? []).map(
                (fact) => (
                  <View key={fact.text} style={{ gap: 4 }}>
                    <AppText font="rowDetail">{fact.text}</AppText>
                    {fact.adjustments.map((adjustment) => (
                      <AppText
                        key={adjustment}
                        font="meta"
                        color={colors.statusPendingText}
                      >
                        {adjustment}
                      </AppText>
                    ))}
                  </View>
                )
              )}
            </SurfaceCard>
          ) : null}
          {preferences.length === 0 ? null : (
            <SurfaceCard>
              <AppText font="sectionLabel" color={colors.inkSecondary}>
                Planning Center preferences
              </AppText>
              {preferences.map((line) => (
                <AppText key={line} font="rowDetail">
                  {line}
                </AppText>
              ))}
            </SurfaceCard>
          )}
          {showsPersonLink ? (
            <PillButton
              title="View Person"
              kind="outline"
              onPress={() => {
                onClose();
                router.push(`/people/${person.id}`);
              }}
            />
          ) : null}
          <PillButton
            title="Open in Planning Center"
            kind="outline"
            onPress={() => {
              openPlanningCenterPerson(person.id);
            }}
          />
        </ScrollView>
        <BottomActionBar
          actions={
            presentation.scheduled
              ? [
                  {
                    title: `Status: ${presentation.status ?? "pending"}`,
                    role: "secondary",
                    onPress: onStatus,
                    disabled: !canSchedule,
                    testID: "assign-detail-status",
                  },
                  {
                    title: "Unschedule",
                    role: "destructive",
                    onPress: onRemove,
                    disabled: !canSchedule,
                    testID: "assign-detail-unschedule",
                  },
                  {
                    title: "Close",
                    role: "secondary",
                    onPress: onClose,
                    testID: "assign-detail-close",
                  },
                ]
              : [
                  {
                    title: `Add to ${slot.position.name}`,
                    onPress: onAdd,
                    disabled:
                      !canSchedule || presentation.disabledReason !== undefined,
                    isBusy: busy,
                    systemImage: "calendar.badge.plus",
                    testID: "assign-detail-add",
                  },
                  {
                    title: "Close",
                    role: "secondary",
                    onPress: onClose,
                    testID: "assign-detail-close",
                  },
                ]
          }
        />
      </View>
    </Modal>
  );
};
