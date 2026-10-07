import type { EditablePlanTime } from "@pcobooster/planning-center-models/plan-time-edits";
import type { TeamPositionGroup } from "@pcobooster/planning-center-models/types";
import { Switch, View } from "react-native";

import { AppText } from "../../../design/app-text";
import { colors } from "../../../design/colors";
import { EditorSection, EditorSheet } from "../editor-sheet";
import { personStatus } from "../roster";
import { toggleId } from "./logic";

const AssignmentToggle = ({
  name,
  detail,
  selected,
  disabled,
  onToggle,
}: {
  name: string;
  detail?: string;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 44,
    }}
  >
    <View style={{ flex: 1 }}>
      <AppText font="rowTitle">{name}</AppText>
      {detail === undefined ? null : (
        <AppText font="meta" color={colors.inkSecondary}>
          {detail}
        </AppText>
      )}
    </View>
    <Switch
      accessibilityLabel={name}
      value={selected}
      disabled={disabled}
      onValueChange={onToggle}
    />
  </View>
);

export const TimeAssignmentPicker = ({
  groups,
  draft,
  onChange,
  editable,
  onClose,
}: {
  groups: TeamPositionGroup[];
  draft: EditablePlanTime;
  onChange: (draft: EditablePlanTime) => void;
  editable: boolean;
  onClose: () => void;
}) => {
  const teamIds = new Set(draft.assignedTeamIds);
  const personIds = new Set(draft.assignedPlanPersonIds);
  const seen = new Set<string>();
  const people = groups.flatMap((group) =>
    group.positions.flatMap((position) =>
      (position.filledPeople ?? []).flatMap((person) => {
        if (seen.has(person.planPersonId)) {
          return [];
        }
        seen.add(person.planPersonId);
        return [{ person, detail: `${group.teamName} · ${position.name}` }];
      })
    )
  );
  return (
    <EditorSheet title="Assignments" onClose={onClose}>
      <EditorSection title="Teams">
        <AssignmentToggle
          name="All teams"
          selected={
            groups.length > 0 &&
            groups.every((group) => teamIds.has(group.teamId))
          }
          disabled={!editable}
          onToggle={() => {
            const all = groups.every((group) => teamIds.has(group.teamId));
            onChange({
              ...draft,
              assignedTeamIds: all ? [] : groups.map((group) => group.teamId),
            });
          }}
        />
        {groups.map((group) => (
          <AssignmentToggle
            key={group.teamId}
            name={group.teamName}
            selected={teamIds.has(group.teamId)}
            disabled={!editable}
            onToggle={() => {
              onChange({
                ...draft,
                assignedTeamIds: toggleId(draft.assignedTeamIds, group.teamId),
              });
            }}
          />
        ))}
      </EditorSection>
      {groups.map((group) => (
        <EditorSection key={group.teamId} title={group.teamName}>
          {group.positions.map((position) => {
            const needed =
              position.source === "needed_position" &&
              position.neededPositionId !== undefined &&
              position.neededPositionId !== "";
            const id = needed
              ? (position.neededPositionId ?? position.id)
              : position.id;
            const field = needed
              ? "assignedNeededPositionIds"
              : "assignedPositionIds";
            return (
              <AssignmentToggle
                key={`${position.source}:${position.id}`}
                name={position.name}
                detail={needed ? "Plan slot" : undefined}
                selected={draft[field].includes(id)}
                disabled={
                  !editable ||
                  (!needed &&
                    position.source !== undefined &&
                    position.source !== "team_position")
                }
                onToggle={() => {
                  onChange({ ...draft, [field]: toggleId(draft[field], id) });
                }}
              />
            );
          })}
        </EditorSection>
      ))}
      <EditorSection title="People">
        {people.map(({ person, detail }) => (
          <AssignmentToggle
            key={person.planPersonId}
            name={person.name}
            detail={detail}
            selected={personIds.has(person.planPersonId)}
            disabled={!editable || personStatus(person) === "declined"}
            onToggle={() => {
              onChange({
                ...draft,
                assignedPlanPersonIds: toggleId(
                  draft.assignedPlanPersonIds,
                  person.planPersonId
                ),
              });
            }}
          />
        ))}
      </EditorSection>
    </EditorSheet>
  );
};
