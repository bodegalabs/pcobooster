import { DatePicker, Host, Picker, Text as SwiftText } from "@expo/ui/swift-ui";
import {
  datePickerStyle,
  disabled,
  environment,
  pickerStyle,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import { formatWallTimeInTimeZone } from "@pcobooster/planning-center-models/calendar";
import { buildEditablePlanTime } from "@pcobooster/planning-center-models/plan-time-edits";
import type { EditablePlanTime } from "@pcobooster/planning-center-models/plan-time-edits";
import type {
  PlanTime,
  PlanTimeType,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Pressable,
  Switch,
  TextInput,
  View,
} from "react-native";

import { AppText } from "../../../design/app-text";
import { colors } from "../../../design/colors";
import { playHaptic } from "../../../design/haptics";
import type { PlanContentWriter } from "../content-writes";
import { EditorSection, EditorSheet } from "../editor-sheet";
import { ReadStatus } from "../read-status";
import { TimeAssignmentPicker } from "./assignment-picker";
import { requestTimeDelete } from "./confirm-delete";
import {
  draftInstant,
  kindLabel,
  moveTimeStart,
  newTimeDraft,
  timeKinds,
} from "./logic";
import { TimeEditSession } from "./time-session";

interface TimeEditorProps {
  time?: PlanTime;
  template: PlanTime[];
  groups?: TeamPositionGroup[];
  groupsError: Error | null;
  retryGroups: () => void;
  zone: string;
  now: Date;
  planDate: Date | null;
  canChange: (kind: PlanTimeType) => boolean;
  writer: PlanContentWriter;
  onClose: () => void;
}

const TimeWhen = ({
  draft,
  change,
  editable,
  zone,
}: {
  draft: EditablePlanTime;
  change: (draft: EditablePlanTime) => void;
  editable: boolean;
  zone: string;
}) => {
  const lastEnd = useRef<Date | null>(null);
  const start = draftInstant(draft, "start", zone);
  return (
    <EditorSection title="When">
      <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
        <DatePicker
          title="Starts"
          selection={start}
          displayedComponents={["date", "hourAndMinute"]}
          modifiers={[
            environment("timeZone", zone),
            datePickerStyle("compact"),
            disabled(!editable),
          ]}
          onDateChange={(date) => {
            change(moveTimeStart(draft, date, zone));
          }}
        />
      </Host>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <AppText font="rowTitle">End time</AppText>
        <Switch
          accessibilityLabel="End time"
          testID="time-end-toggle"
          value={draft.endTime !== ""}
          disabled={!editable}
          onValueChange={(enabled) => {
            if (!enabled) {
              lastEnd.current = draftInstant(draft, "end", zone);
              change({ ...draft, endDate: draft.startDate, endTime: "" });
              return;
            }
            const instant = new Date(
              Math.max(
                lastEnd.current?.getTime() ?? start.getTime() + 3_600_000,
                start.getTime()
              )
            );
            const wall = formatWallTimeInTimeZone(instant, zone);
            change({
              ...draft,
              endDate: wall.dateKey,
              endTime: wall.timeValue,
            });
          }}
        />
      </View>
      {draft.endTime === "" ? null : (
        <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
          <DatePicker
            title="Ends"
            selection={draftInstant(draft, "end", zone)}
            displayedComponents={["date", "hourAndMinute"]}
            range={{ start }}
            modifiers={[
              environment("timeZone", zone),
              datePickerStyle("compact"),
              disabled(!editable),
            ]}
            onDateChange={(date) => {
              const wall = formatWallTimeInTimeZone(date, zone);
              change({
                ...draft,
                endDate: wall.dateKey,
                endTime: wall.timeValue,
              });
            }}
          />
        </Host>
      )}
      <AppText font="meta" color={colors.inkSecondary}>
        Times are in {zone}.
      </AppText>
    </EditorSection>
  );
};

export const TimeEditor = (props: TimeEditorProps) => {
  const { time, zone, groups, canChange, writer, onClose } = props;
  // One session per opened form; its rules decide saving and closing, the state renders the draft.
  const [form, setForm] = useState(() => {
    const opening =
      time === undefined
        ? newTimeDraft(props.template, zone, props.planDate, props.now)
        : buildEditablePlanTime(time, zone, groups);
    if (time === undefined && !canChange(opening.timeType)) {
      opening.timeType = "rehearsal";
      opening.name = "New rehearsal";
    }
    return {
      draft: opening,
      session: new TimeEditSession({
        writer,
        zone,
        time,
        draft: opening,
        groups,
        editable: canChange(time?.timeType ?? opening.timeType),
      }),
    };
  });
  const { session } = form;
  session.rosterLoaded(groups);
  const { draft, editable } = session;
  const setDraft = (next: EditablePlanTime) => {
    session.change(next);
    setForm({ draft: next, session });
  };
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        void session.save();
      }
    });
    return () => {
      subscription.remove();
      session.leave();
    };
  }, [session]);
  const [assignments, setAssignments] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const discard = () => {
    session.abandon();
    onClose();
  };
  const leave = () => {
    session.leave();
    onClose();
  };
  const close = () => {
    // Unchanged still leaves: a save in flight or queued behind it carries the final form.
    if (!editable || !session.changed) {
      leave();
      return;
    }
    if (session.creating) {
      playHaptic("warning");
      Alert.alert(
        "Discard this time?",
        "Keep editing or discard this new time.",
        [
          { text: "Keep editing", style: "cancel" },
          { text: "Discard time", style: "destructive", onPress: discard },
        ]
      );
      return;
    }
    const message = session.problem;
    if (message !== null) {
      setError(message);
      playHaptic("warning");
      Alert.alert(message, "Keep editing or discard these changes.", [
        { text: "Keep Editing", style: "cancel" },
        { text: "Discard Changes", style: "destructive", onPress: discard },
      ]);
      return;
    }
    leave();
  };
  const add = () => {
    const message = session.problem;
    if (message !== null) {
      setError(message);
      return;
    }
    setBusy(true);
    void (async () => {
      if (await session.create()) {
        onClose();
      } else {
        setBusy(false);
      }
    })();
  };
  const remove = () => {
    if (time === undefined) {
      return;
    }
    requestTimeDelete(() => {
      session.abandon();
      onClose();
      void writer.deleteTime(time.id);
    });
  };
  if (assignments && groups !== undefined) {
    return (
      <TimeAssignmentPicker
        groups={groups}
        draft={draft}
        onChange={setDraft}
        editable={editable}
        onClose={() => {
          setAssignments(false);
        }}
      />
    );
  }
  return (
    <EditorSheet
      title={time === undefined ? "Add time" : "Time"}
      onClose={close}
      holdsDismiss={session.holdsDismiss}
      actions={
        editable
          ? [
              {
                title: time === undefined ? "Add time" : "Delete time",
                role: time === undefined ? "prominent" : "destructive",
                onPress: time === undefined ? add : remove,
                disabled: busy || groups === undefined,
                testID: time === undefined ? "time-create" : "time-delete",
              },
            ]
          : []
      }
    >
      {editable ? null : (
        <AppText font="meta" color={colors.inkSecondary}>
          Changing this time needs Scheduler or Editor access in Planning
          Center.
        </AppText>
      )}
      <EditorSection title="Name">
        <TextInput
          accessibilityLabel="Time name"
          testID="time-name-field"
          value={draft.name}
          style={{ fontSize: 17, color: colors.ink, minHeight: 36 }}
          editable={editable}
          onChangeText={(name) => {
            setDraft({ ...draft, name });
          }}
        />
      </EditorSection>
      <EditorSection title="Type">
        <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
          <Picker
            selection={draft.timeType}
            modifiers={[pickerStyle("segmented"), disabled(!editable)]}
            onSelectionChange={(timeType: PlanTimeType) => {
              setDraft({ ...draft, timeType });
              playHaptic("selection");
            }}
          >
            {timeKinds.flatMap((kind) =>
              canChange(kind) || kind === draft.timeType
                ? [
                    <SwiftText key={kind} modifiers={[tag(kind)]}>
                      {kindLabel(kind)}
                    </SwiftText>,
                  ]
                : []
            )}
          </Picker>
        </Host>
      </EditorSection>
      <TimeWhen
        draft={draft}
        change={setDraft}
        editable={editable}
        zone={zone}
      />
      {error === null ? null : (
        <AppText font="meta" color={colors.destructive}>
          {error}
        </AppText>
      )}
      <EditorSection title="Assignments">
        {groups === undefined ? (
          <ReadStatus error={props.groupsError} retry={props.retryGroups} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Assigned to"
            testID="time-assignments-row"
            onPress={() => {
              setAssignments(true);
            }}
          >
            <AppText font="rowTitle">Assigned to</AppText>
            <AppText font="rowDetail" color={colors.inkSecondary}>
              {draft.assignedTeamIds.length} teams,{" "}
              {draft.assignedPositionIds.length +
                draft.assignedNeededPositionIds.length}{" "}
              positions, {draft.assignedPlanPersonIds.length} people
            </AppText>
          </Pressable>
        )}
      </EditorSection>
    </EditorSheet>
  );
};
