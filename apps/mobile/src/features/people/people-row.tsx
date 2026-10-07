import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { ActionSheetIOS, Pressable, StyleSheet, View } from "react-native";

import { useProductClient } from "../../app-shell/queries";
import { useVisibleReadSignal } from "../../app-shell/visible-queries";
import { Hairline } from "../../components/hairline";
import { PersonAvatar } from "../../components/person-avatar";
import { StatusBadge } from "../../components/status-badge";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { playHaptic } from "../../design/haptics";
import { Metrics, Spacing } from "../../design/metrics";
import type { StatusTone } from "../../design/status";
import { useToasts } from "../../lib/toasts";
import { useOpenPlanningCenterPerson } from "../plan/roster-links";
import { describeRoles, SEPARATOR } from "./dashboard";
import type { PeopleRow } from "./dashboard";
import { prefetchPerson } from "./reads";
import { peopleDestinations, peopleTestIds } from "./routes";
import { describeSignal, formatDayKey, isListSignal } from "./team-health";
import type { PersonSignal } from "./team-health";
import type { RosterPerson } from "./types";

/** Hairlines start under the name, past the avatar. */
const AVATAR_INSET = Spacing.lg + 32 + Spacing.md;

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.xs },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.md,
    minHeight: Metrics.minimumTapTarget + Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
  },
  text: { flex: 1, gap: Spacing.xxs },
});

const signalTone: Record<PersonSignal["kind"], StatusTone> = {
  waiting: "pending",
  declining: "declined",
  drifting: "pending",
  overloaded: "declined",
  due: "neutral",
};

/** A person's signals as chips; each speaks its full sentence. */
export const SignalChips = ({
  signals,
}: {
  signals: readonly PersonSignal[];
}) =>
  signals.length === 0 ? null : (
    <View style={styles.chips}>
      {signals.map((signal) => {
        const text = describeSignal(signal);
        return (
          <View
            accessibilityLabel={`${text.label}. ${text.detail}`}
            accessible
            key={signal.kind}
          >
            <StatusBadge tone={signalTone[signal.kind]} title={text.label} />
          </View>
        );
      })}
    </View>
  );

/** "Last served Sep 27 · Next Oct 11", or where their schedule stands. */
const scheduleLine = (row: PeopleRow): string => {
  if (row.member === null) {
    return row.loading ? "Loading schedule…" : "Schedule not loaded";
  }
  const { lastServedOn, nextServingOn } = row.member.rhythm;
  return [
    lastServedOn === null
      ? "Not served in 6 months"
      : `Last served ${formatDayKey(lastServedOn)}`,
    nextServingOn === null ? null : `Next ${formatDayKey(nextServingOn)}`,
  ]
    .filter((part) => part !== null)
    .join(SEPARATOR);
};

/** Show details, or Open in Planning Center, from a long press; loads their month ahead. */
const usePersonActions = () => {
  const router = useRouter();
  const context = useProductClient();
  const cache = useQueryClient();
  const readSignal = useVisibleReadSignal();
  const openPlanningCenter = useOpenPlanningCenterPerson();
  const toasts = useToasts();
  const copyName = async (name: string) => {
    try {
      await Clipboard.setStringAsync(name);
      playHaptic("success");
    } catch {
      toasts.showError("Couldn’t copy the name. Try again.");
    }
  };
  return {
    open: (personId: string) => {
      router.push(peopleDestinations.person(personId));
    },
    showActions: (person: RosterPerson) => {
      void prefetchPerson(context, cache, person.id, readSignal());
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: person.name,
          options: [
            "Cancel",
            "Show Details",
            "Open in Planning Center",
            "Copy Name",
          ],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) {
            router.push(peopleDestinations.person(person.id));
          } else if (index === 2) {
            openPlanningCenter(person.id);
          } else if (index === 3) {
            void copyName(person.name);
          }
        }
      );
    },
  };
};

/**
 * A person in the list: avatar, name, teams and roles, when they served last and serve next,
 * and their list signals. Tapping opens them; a long press offers actions.
 */
export const PersonListRow = ({
  row,
  signals,
  detail,
  separated,
}: {
  row: PeopleRow;
  signals: readonly PersonSignal[];
  /** Draws the inset hairline above it (every row after the first). */
  separated: boolean;
  /** Replaces the schedule line (the month view shows the day's commitment). */
  detail?: string;
}) => {
  const actions = usePersonActions();
  const { person } = row;
  const roles = describeRoles(person, row.member);
  const schedule = detail ?? scheduleLine(row);
  const listSignals = signals.filter(isListSignal);
  return (
    <View>
      {separated ? (
        <Hairline color={colors.hairlineSubtle} inset={AVATAR_INSET} />
      ) : null}
      <Pressable
        accessibilityHint="Shows their serving, month, and blockouts"
        accessibilityLabel={[person.name, roles, schedule]
          .filter((part) => part !== "")
          .join(", ")}
        accessibilityRole="button"
        onLongPress={() => {
          actions.showActions(person);
        }}
        onPress={() => {
          actions.open(person.id);
        }}
        style={({ pressed }) => [
          styles.row,
          pressed ? { backgroundColor: colors.surfaceHighlight } : null,
        ]}
        testID={peopleTestIds.row(person.id)}
      >
        <PersonAvatar name={person.name} photoUrl={person.photoThumbnailUrl} />
        <View style={styles.text}>
          <AppText
            color={colors.ink}
            font="rowTitleEmphasized"
            numberOfLines={1}
          >
            {person.name}
          </AppText>
          {roles === "" ? null : (
            <AppText color={colors.inkSecondary} font="meta" numberOfLines={2}>
              {roles}
            </AppText>
          )}
          <AppText
            color={colors.inkSecondary}
            font="meta"
            numberOfLines={2}
            tabular
          >
            {schedule}
          </AppText>
          <SignalChips signals={listSignals} />
        </View>
      </Pressable>
    </View>
  );
};
