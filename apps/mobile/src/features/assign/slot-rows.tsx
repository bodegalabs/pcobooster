import type { FilledPositionPerson } from "@pcobooster/planning-center-models/types";
import { Pressable, StyleSheet, View } from "react-native";

import { DashedCircle } from "../../components/dashed-circle";
import { Glyph } from "../../components/glyph";
import { PersonAvatar } from "../../components/person-avatar";
import { AppText } from "../../design/app-text";
import { colors, tokenColor } from "../../design/colors";
import { scheduleStatusLabel } from "../../design/status";
import {
  canAddSlot,
  canRemoveSlot,
  filled,
  openSlots,
  personStatus,
} from "../plan/roster";
import type { PlanWriter } from "../plan/writes";
import { openSlotsLabel } from "./presentation";
import type { ResolvedSlot } from "./presentation";

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    paddingVertical: 21,
  },
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    borderRadius: 999,
    height: 32,
    paddingHorizontal: 4,
    backgroundColor: colors.surfaceCard,
  },
  step: { width: 32, alignItems: "center" },
});

/** The slot's filled and needed count, with buttons to change how many are needed. */
export const SlotStepper = ({
  slot,
  writer,
  canSchedule,
}: {
  slot: ResolvedSlot;
  writer: PlanWriter;
  canSchedule: boolean;
}) => (
  <View style={styles.stepper}>
    <Pressable
      accessibilityLabel="Remove open slot"
      accessibilityRole="button"
      disabled={!canSchedule || !canRemoveSlot(slot.position)}
      onPress={() => {
        void writer.adjust(slot.position, "remove");
      }}
      style={[styles.step, { opacity: canRemoveSlot(slot.position) ? 1 : 0.3 }]}
    >
      <Glyph symbol="subtract" size={14} color={colors.ink} />
    </Pressable>
    <AppText
      font="footnote"
      weight="semibold"
      tabular
      numberOfLines={1}
    >{`${filled(slot.position)}/${filled(slot.position) + openSlots(slot.position)}`}</AppText>
    <Pressable
      accessibilityLabel="Add open slot"
      accessibilityRole="button"
      disabled={!canSchedule || !canAddSlot(slot.position)}
      onPress={() => {
        void writer.adjust(slot.position, "add");
      }}
      style={[styles.step, { opacity: canAddSlot(slot.position) ? 1 : 0.3 }]}
    >
      <Glyph symbol="add" size={14} color={colors.ink} />
    </Pressable>
  </View>
);

/**
 * Someone on the slot who isn't on the position's roster, such as a one-off addition (Swift
 * `AssignOffRosterRow`): avatar, name, the unsent envelope, and their status.
 */
export const OffRosterRow = ({
  person,
  notNotified,
  onStatus,
}: {
  person: FilledPositionPerson;
  notNotified: boolean;
  onStatus: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={`Status for ${person.name}`}
    accessibilityValue={{ text: scheduleStatusLabel[personStatus(person)] }}
    testID={`assign-status-${person.personId ?? person.id}-${personStatus(person)}`}
    onPress={onStatus}
    style={styles.row}
  >
    <PersonAvatar
      name={person.name}
      photoUrl={person.photoThumbnailUrl}
      size="large"
      status={personStatus(person)}
    />
    <AppText font="rowTitleEmphasized" style={{ flex: 1 }} numberOfLines={1}>
      {person.name}
    </AppText>
    {notNotified ? (
      <Glyph
        symbol="mail"
        size={15}
        color={colors.inkSecondary}
        accessibilityLabel="Not notified yet"
      />
    ) : null}
    <AppText font="meta">{scheduleStatusLabel[personStatus(person)]}</AppText>
  </Pressable>
);

/** The slot's remaining openings, as one quiet row under the people on it. */
export const OpenSlotsRow = ({ open }: { open: number }) => {
  const tone = open > 0 ? colors.statusDeclinedText : colors.inkTertiary;
  return (
    <View style={styles.row} accessible>
      <View style={styles.circle}>
        <DashedCircle
          size={40}
          lineWidth={1}
          dash={3}
          gap={2.5}
          color={
            open > 0 ? tokenColor("statusDeclined", 0.5) : colors.inkTertiary
          }
        />
        <View style={{ position: "absolute" }}>
          <Glyph symbol="addPerson" size={18} color={tone} />
        </View>
      </View>
      <AppText
        font="rowTitle"
        color={open > 0 ? colors.statusDeclinedText : colors.inkSecondary}
      >
        {openSlotsLabel(open)}
      </AppText>
    </View>
  );
};

/**
 * "Someone else...": schedule anyone from Planning Center, not only the position's roster.
 * When it can't be used, it stays visible with the reason underneath.
 */
export const SomeoneElseRow = ({
  disabledReason,
  onPress,
}: {
  disabledReason: string | undefined;
  onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel="Schedule someone else"
    accessibilityHint={disabledReason ?? "Search everyone in Planning Center"}
    testID="assign-someone-else"
    disabled={disabledReason !== undefined}
    onPress={onPress}
    style={styles.row}
  >
    <View style={[styles.circle, { backgroundColor: colors.surfaceMuted }]}>
      <Glyph symbol="addPerson" size={18} color={colors.inkSecondary} />
    </View>
    <View style={{ flex: 1, gap: 2 }}>
      <AppText
        font="rowTitleEmphasized"
        color={disabledReason === undefined ? colors.ink : colors.inkSecondary}
      >
        Someone else…
      </AppText>
      {disabledReason === undefined ? null : (
        <AppText font="meta" color={colors.inkSecondary}>
          {disabledReason}
        </AppText>
      )}
    </View>
    {disabledReason === undefined ? (
      <Glyph symbol="chevronRight" size={12} color={colors.inkTertiary} />
    ) : null}
  </Pressable>
);
