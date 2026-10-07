import { buildScheduleDays } from "@pcobooster/planning-center-models/schedule-days";
import type { PersonWithAvailability } from "@pcobooster/planning-center-models/types";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { Glyph } from "../../components/glyph";
import { PersonAvatar } from "../../components/person-avatar";
import { AppText } from "../../design/app-text";
import { colors, tokenColor } from "../../design/colors";
import { scheduleStatusLabel, toneColors } from "../../design/status";
import { DayBars } from "./day-bars";
import { fitTone } from "./presentation";
import type { CandidatePresentation } from "./presentation";

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 21 },
  main: { flexDirection: "row", alignItems: "center", gap: 12 },
  identity: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  facts: { flex: 1, gap: 2 },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  blocked: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokenColor("destructive", 0.24),
  },
  status: {
    flexDirection: "row",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    height: 32,
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
  },
});
export const FitScore = ({ score }: { score: number }) => {
  const tone = toneColors[fitTone(score)];
  return (
    <View style={{ gap: 4, alignItems: "flex-end", width: 44 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
        <AppText
          font="callout"
          weight="semibold"
          color={tone.text}
          tabular
          numberOfLines={1}
        >
          {score}
        </AppText>
        <AppText font="caption2" color={colors.inkSecondary} numberOfLines={1}>
          fit
        </AppText>
      </View>
      <View
        style={{
          width: 44,
          height: 4,
          backgroundColor: colors.surfaceMuted,
          borderRadius: 2,
        }}
      >
        <View
          style={{
            width: (44 * Math.max(score, 3)) / 100,
            height: 4,
            backgroundColor: tone.meter,
            borderRadius: 2,
          }}
        />
      </View>
    </View>
  );
};
interface CandidateRowProps {
  person: PersonWithAvailability;
  presentation: CandidatePresentation;
  date: Date;
  zone: string;
  history: boolean;
  /** Their assignment here has a prepared, unsent scheduling email. */
  notNotified: boolean;
  canSchedule: boolean;
  busy: boolean;
  onDetails: () => void;
  onAdd: () => void;
  onStatus: () => void;
}
const unavailableOf = (presentation: CandidatePresentation): boolean =>
  presentation.blocked || presentation.declined;

/** Avatar with their slot status, the name with Blocked or Declined, and the facts line. */
const CandidateIdentity = ({
  person,
  presentation,
  onDetails,
}: Pick<CandidateRowProps, "person" | "presentation" | "onDetails">) => {
  const unavailable = unavailableOf(presentation);
  const conflicts = new Set(presentation.conflicts);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={person.fullName}
      accessibilityHint="Shows their history and ranking"
      onPress={onDetails}
      style={styles.identity}
    >
      <View style={{ opacity: unavailable ? 0.7 : 1 }}>
        <PersonAvatar
          name={person.fullName}
          size="large"
          photoUrl={person.photoThumbnailUrl}
          status={presentation.status}
          alsoScheduled={presentation.others.length > 0}
        />
        {presentation.blocked ? <View style={styles.blocked} /> : null}
      </View>
      <View style={styles.facts}>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <AppText
            font="rowTitleEmphasized"
            numberOfLines={1}
            color={unavailable ? colors.inkSecondary : colors.ink}
            style={[
              { flexShrink: 1 },
              unavailable ? { textDecorationLine: "line-through" } : null,
            ]}
          >
            {person.fullName}
          </AppText>
          {unavailable ? (
            <AppText
              font="capsLabel"
              color={
                presentation.blocked
                  ? colors.statusPendingText
                  : colors.statusDeclinedText
              }
            >
              {presentation.blocked ? "BLOCKED" : "DECLINED"}
            </AppText>
          ) : null}
        </View>
        <AppText font="meta" color={colors.inkSecondary} numberOfLines={1}>
          {presentation.facts.map((fact, index) => {
            let color = colors.inkSecondary;
            if (conflicts.has(fact)) {
              color = colors.statusPendingText;
            } else if (fact.startsWith("Also on ")) {
              color = colors.statusInfoText;
            }
            return (
              <AppText key={fact} font="meta" color={color}>
                {index === 0 ? fact : ` · ${fact}`}
              </AppText>
            );
          })}
        </AppText>
      </View>
    </Pressable>
  );
};

/** Their status pill once they're on the slot (with the unsent envelope), otherwise Add. */
const CandidateAction = ({
  person,
  presentation,
  notNotified,
  canSchedule,
  busy,
  onAdd,
  onStatus,
}: Omit<CandidateRowProps, "date" | "zone" | "history" | "onDetails">) => {
  if (presentation.scheduled) {
    const status = presentation.status ?? "pending";
    return (
      <>
        {notNotified ? (
          <Glyph
            symbol="mail"
            size={15}
            color={colors.inkSecondary}
            accessibilityLabel="Not notified yet"
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Status for ${person.fullName}`}
          accessibilityValue={{ text: scheduleStatusLabel[status] }}
          testID={`assign-status-${person.id}-${status}`}
          onPress={onStatus}
          style={styles.status}
          disabled={!canSchedule}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: toneColors[status].color,
            }}
          />
          <AppText font="subheadline" weight="medium" numberOfLines={1}>
            {scheduleStatusLabel[status]}
          </AppText>
        </Pressable>
      </>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        busy ? `Adding ${person.fullName}` : `Add ${person.fullName}`
      }
      accessibilityHint={presentation.disabledReason}
      testID={`assign-add-${person.id}`}
      onPress={onAdd}
      disabled={
        !canSchedule || presentation.disabledReason !== undefined || busy
      }
      style={[
        styles.button,
        {
          opacity:
            busy || (canSchedule && presentation.disabledReason === undefined)
              ? 1
              : 0.4,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" />
      ) : (
        <Glyph symbol="addToSchedule" size={18} color={colors.ink} />
      )}
    </Pressable>
  );
};

export const CandidateRow = (props: CandidateRowProps) => {
  const { person, presentation, date, zone, history, onDetails } = props;
  return (
    <View testID={`candidate-${person.id}`} style={styles.row}>
      <View style={styles.main}>
        <CandidateIdentity
          person={person}
          presentation={presentation}
          onDetails={onDetails}
        />
        {presentation.showsFit && presentation.score !== undefined ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${presentation.score} fit, why this ranking`}
            style={{ paddingHorizontal: 4 }}
            onPress={onDetails}
          >
            <FitScore score={presentation.score} />
          </Pressable>
        ) : null}
        <CandidateAction {...props} />
      </View>
      {history && person.serviceHistory !== undefined ? (
        <View style={{ paddingLeft: 52, marginTop: 8 }}>
          <DayBars
            days={buildScheduleDays(person.serviceHistory, date, zone)}
          />
        </View>
      ) : null}
    </View>
  );
};
