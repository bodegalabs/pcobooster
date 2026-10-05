import { queryKeys } from "@pcobooster/client/query-keys";
import type {
  PlanTime,
  PlanTimeType,
} from "@pcobooster/contracts/plan-time-schemas";
import {
  formatWallTimeInTimeZone,
  zonedWallTimeToUtcIso,
} from "@pcobooster/planning-center-models/calendar";
import { useState } from "react";

import { TimeIndividualAssignments } from "../components/time-individual-assignments";
import {
  Action,
  Card,
  Choice,
  Editor,
  Field,
  Label,
  ReadState,
  Row,
  Toggle,
} from "../components/ui";
import { confirmRemove } from "../dialogs";
import { runAction } from "../errors";
import { useRpcMutation, useRpcQuery } from "../runtime";
import {
  allowedTimeTypes,
  canChangeTime,
  timeAccessNotice,
} from "../time-access";
import { timeAssignmentChanges } from "../time-assignments";
import type { PlanContext } from "./plan";

const initialTimeBounds = (
  time: PlanTime | null,
  timeZone: string,
  planDate?: Date
) => {
  const start = formatWallTimeInTimeZone(
    time?.startsAt ?? planDate ?? new Date(),
    timeZone
  );
  const end = time?.endsAt
    ? formatWallTimeInTimeZone(time.endsAt, timeZone)
    : null;
  return { start, end };
};

const initialTimeDraft = (
  context: PlanContext,
  time: PlanTime | null,
  creating: boolean
) => {
  const { start, end } = initialTimeBounds(
    time,
    context.timeZone,
    context.planDate
  );
  const allowed = allowedTimeTypes(context);
  const proposedType = time?.timeType ?? "service";
  const type =
    creating && !canChangeTime(context, proposedType)
      ? (allowed[0] ?? "rehearsal")
      : proposedType;
  return {
    name: time?.name ?? "",
    start,
    end,
    type,
    teams: time?.assignedTeamIds ?? [],
    positions: time?.assignedPositionIds ?? [],
    editable: creating
      ? allowed.length > 0
      : canChangeTime(context, proposedType),
  };
};

const TimeEditor = ({
  context,
  time,
  creating,
  onClosed,
}: {
  context: PlanContext;
  time: PlanTime | null;
  creating: boolean;
  onClosed: () => void;
}) => {
  const initial = initialTimeDraft(context, time, creating);
  const [name, setName] = useState(initial.name);
  const [date, setDate] = useState(initial.start.dateKey);
  const [starts, setStarts] = useState(initial.start.timeValue);
  const [ends, setEnds] = useState(initial.end?.timeValue ?? "");
  const [endDate, setEndDate] = useState(
    initial.end?.dateKey ?? initial.start.dateKey
  );
  const [type, setType] = useState<PlanTimeType>(initial.type);
  const [teams, setTeams] = useState(initial.teams);
  const [positions, setPositions] = useState(initial.positions);
  const allowed = allowedTimeTypes(context);
  const { editable } = initial;
  const [individualChanges, setIndividualChanges] = useState(
    new Map<string, boolean>()
  );
  const teamIds = new Set(teams);
  const positionIds = new Set(positions);
  const groups = useRpcQuery(
    "catalog.teamPositions",
    context,
    queryKeys.teamPositions(context.serviceTypeId, context.planId, null)
  );
  const update = useRpcMutation("planTimes.update");
  const create = useRpcMutation("planTimes.create");
  const save = async () => {
    if (editable && canChangeTime(context, type)) {
      const input = {
        ...context,
        name,
        startsAt: zonedWallTimeToUtcIso(date, starts, context.timeZone),
        endsAt: ends
          ? zonedWallTimeToUtcIso(endDate, ends, context.timeZone)
          : null,
        timeType: type,
        assignedTeamIds: teams,
        assignedPositionIds: positions,
      };
      if (creating) {
        await create.mutateAsync(input);
      } else if (time !== null) {
        await update.mutateAsync({
          ...input,
          ...timeAssignmentChanges(individualChanges),
          planTimeId: time.id,
        });
      }
    }
    onClosed();
  };
  return (
    <Editor
      label={creating ? "Add time" : "Edit time"}
      visible
      onClose={() => {
        if (creating) {
          onClosed();
        } else {
          void runAction(save);
        }
      }}
      busy={update.isPending || create.isPending}
    >
      <Label secondary>All times use {context.timeZone}.</Label>
      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        editable={editable}
      />
      {editable ? (
        <Choice values={allowed} value={type} onChange={setType} />
      ) : (
        <Label secondary>
          {type}: service times need Editor access in Planning Center.
        </Label>
      )}
      {context.canEdit || !context.canSchedule ? null : (
        <Label secondary>
          Service times need Editor access in Planning Center.
        </Label>
      )}
      <Field
        label="Date, YYYY-MM-DD"
        value={date}
        onChangeText={setDate}
        editable={editable}
      />
      <Field
        label="Starts, HH:MM"
        value={starts}
        onChangeText={setStarts}
        editable={editable}
      />
      <Field
        label="End date, YYYY-MM-DD"
        value={endDate}
        onChangeText={setEndDate}
        editable={editable}
      />
      <Field
        label="Ends, HH:MM (optional)"
        value={ends}
        onChangeText={setEnds}
        editable={editable}
      />
      {time === null || creating ? null : (
        <TimeIndividualAssignments
          groups={groups.data ?? []}
          timeId={time.id}
          changes={individualChanges}
          editable={editable}
          onChange={(key, checked) => {
            setIndividualChanges((current) =>
              new Map(current).set(key, checked)
            );
          }}
        />
      )}
      <Card title="Assignments">
        {groups.data?.map((group) => (
          <Card key={group.teamId} title={group.teamName}>
            <Toggle
              label="Whole team"
              checked={teamIds.has(group.teamId)}
              onChange={(checked) => {
                if (editable) {
                  setTeams(
                    checked
                      ? [...teams, group.teamId]
                      : teams.filter((id) => id !== group.teamId)
                  );
                }
              }}
            />
            {group.positions.map((position) => (
              <Toggle
                key={position.id}
                label={position.name}
                checked={positionIds.has(position.id)}
                onChange={(checked) => {
                  if (editable) {
                    setPositions(
                      checked
                        ? [...positions, position.id]
                        : positions.filter((id) => id !== position.id)
                    );
                  }
                }}
              />
            ))}
          </Card>
        ))}
      </Card>
      {creating ? (
        <Action
          label="Add to plan"
          disabled={!editable || !name.trim() || create.isPending}
          onPress={() => {
            void runAction(save);
          }}
        />
      ) : null}
    </Editor>
  );
};

export const Times = ({ context }: { context: PlanContext }) => {
  const times = useRpcQuery(
    "planTimes.list",
    context,
    queryKeys.planTimes(context.serviceTypeId, context.planId)
  );
  const [selected, setSelected] = useState<{
    time: PlanTime | null;
    creating: boolean;
  } | null>(null);
  const canAdd = allowedTimeTypes(context).length > 0;
  const notice = timeAccessNotice(context);
  const remove = useRpcMutation("planTimes.delete");
  return (
    <ReadState query={times}>
      {notice === null ? null : <Label secondary>{notice}</Label>}
      {times.data?.map((time) => {
        const wall = formatWallTimeInTimeZone(time.startsAt, context.timeZone);
        return (
          <Card key={time.id}>
            <Row
              title={time.name || time.timeType}
              detail={`${wall.dateKey} at ${wall.timeValue}, ${time.timeType}`}
              onPress={() => {
                setSelected({ time, creating: false });
              }}
            />
            {canAdd ? (
              <Action
                label={`Duplicate ${time.name || time.timeType}`}
                onPress={() => {
                  setSelected({ time, creating: true });
                }}
              />
            ) : null}
            {canChangeTime(context, time.timeType) ? (
              <Action
                label={`Remove ${time.name || time.timeType}`}
                destructive
                onPress={() => {
                  confirmRemove(time.name || time.timeType, () => {
                    remove.mutate({ ...context, planTimeId: time.id });
                  });
                }}
              />
            ) : null}
          </Card>
        );
      })}
      {canAdd ? (
        <Action
          label="Add time"
          onPress={() => {
            setSelected({ time: times.data?.at(-1) ?? null, creating: true });
          }}
        />
      ) : null}
      {selected === null ? null : (
        <TimeEditor
          key={`${selected.creating}.${selected.time?.id ?? "new"}`}
          context={context}
          time={selected.time}
          creating={selected.creating}
          onClosed={() => {
            setSelected(null);
          }}
        />
      )}
    </ReadState>
  );
};
