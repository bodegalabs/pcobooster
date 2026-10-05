import { addCustomLineupPosition } from "@pcobooster/client/custom-position";
import { applyLineupColumnOrder } from "@pcobooster/client/lineup-column-order";
import { findNextOpenPosition } from "@pcobooster/client/open-positions";
import { queryKeys } from "@pcobooster/client/query-keys";
import type {
  FilledPositionPerson,
  TeamPosition,
  TeamPositionGroup,
} from "@pcobooster/contracts/catalog";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useReducer, useState, useSyncExternalStore } from "react";

import { LineupLayoutControls, LineupTeam } from "../components/lineup-layout";
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
import { LineupPreferencesStore } from "../lineup-preferences";
import { useRpcMutation, useRpcQuery, useSession } from "../runtime";
import { tabRouter as router } from "../tab-router";
import type { PlanContext } from "./plan";

const statusLabel = (status: string): string => {
  if (status === "C") {
    return "Confirmed";
  }
  if (status === "D") {
    return "Declined";
  }
  return "Pending";
};
const statusCode = (status: string): "C" | "D" | "U" => {
  if (status === "Confirmed") {
    return "C";
  }
  if (status === "Declined") {
    return "D";
  }
  return "U";
};
const LineupPosition = ({
  position,
  canSchedule,
  onSelect,
  onAssign,
  onAdjust,
}: {
  position: TeamPosition;
  canSchedule: boolean;
  onSelect: (person: FilledPositionPerson) => void;
  onAssign: () => void;
  onAdjust: (change: "add" | "remove") => void;
}) => (
  <Card title={position.name}>
    <Label secondary>{position.neededCount ?? 0} open slots</Label>
    {position.filledPeople?.map((person) => (
      <Row
        key={person.planPersonId}
        title={person.name}
        detail={`${statusLabel(person.rawStatus)}${(person.notification?.sentAt ?? "") === "" ? ", not notified" : ""}`}
        onPress={() => {
          onSelect(person);
        }}
      />
    ))}
    {canSchedule ? (
      <>
        <Action label={`Assign ${position.name}`} onPress={onAssign} />
        <Choice
          values={["Add open slot", "Remove open slot"]}
          value=""
          onChange={(value) => {
            onAdjust(value === "Add open slot" ? "add" : "remove");
          }}
        />
      </>
    ) : null}
  </Card>
);

const LineupPersonEditor = ({
  context,
  person,
  onClosed,
}: {
  context: PlanContext;
  person: FilledPositionPerson;
  onClosed: () => void;
}) => {
  const status = useRpcMutation("schedule.updateStatus");
  const remove = useRpcMutation("schedule.remove");
  const updateTimes = useRpcMutation("planPeople.updateTimes");
  const times = useRpcQuery(
    "planTimes.list",
    context,
    queryKeys.planTimes(context.serviceTypeId, context.planId)
  );
  const [timeIds, setTimeIds] = useState<readonly string[]>(
    person.assignedTimeIds ?? []
  );
  const [rawStatus, setRawStatus] = useState(person.rawStatus);
  const close = async (): Promise<void> => {
    if (
      person.personId !== undefined &&
      person.personId !== null &&
      context.canSchedule &&
      JSON.stringify(timeIds) !== JSON.stringify(person.assignedTimeIds ?? [])
    ) {
      await updateTimes.mutateAsync({
        ...context,
        personId: person.personId,
        planPersonId: person.planPersonId,
        planTimeIds: [...timeIds],
      });
    }
    onClosed();
  };
  const { personId } = person;
  return (
    <Editor
      label={person.name}
      visible
      busy={updateTimes.isPending || status.isPending || remove.isPending}
      onClose={() => {
        void runAction(close);
      }}
    >
      {personId === null || personId === undefined ? null : (
        <Action
          label="Person details"
          onPress={() => {
            void runAction(async () => {
              await close();
              router.push(`/people/${personId}`);
            });
          }}
        />
      )}
      {context.canSchedule ? (
        <>
          <Choice
            values={["Confirmed", "Pending", "Declined"]}
            value={statusLabel(rawStatus)}
            onChange={(value) => {
              const code = statusCode(value);
              status.mutate(
                {
                  ...context,
                  planPersonId: person.planPersonId,
                  personId: person.personId ?? undefined,
                  status: code,
                },
                {
                  onSuccess: () => {
                    setRawStatus(code);
                  },
                }
              );
            }}
          />
          <Card title="Assigned times">
            <ReadState query={times}>
              {times.data?.map((time) => (
                <Toggle
                  key={time.id}
                  label={time.name || time.timeType}
                  checked={new Set(timeIds).has(time.id)}
                  onChange={(checked) => {
                    setTimeIds(
                      checked
                        ? [...timeIds, time.id]
                        : timeIds.filter((id) => id !== time.id)
                    );
                  }}
                />
              ))}
            </ReadState>
          </Card>
          <Action
            label="Remove from plan"
            destructive
            disabled={remove.isPending}
            onPress={() => {
              confirmRemove(person.name, () => {
                remove.mutate(
                  {
                    ...context,
                    planPersonId: person.planPersonId,
                    personId: person.personId ?? undefined,
                  },
                  { onSuccess: onClosed }
                );
              });
            }}
          />
        </>
      ) : (
        <Label secondary>View only</Label>
      )}
    </Editor>
  );
};

const LineupWorkspace = ({
  context,
  scope,
}: {
  context: PlanContext;
  scope: string;
}) => {
  const groups = useRpcQuery(
    "catalog.teamPositions",
    context,
    queryKeys.teamPositions(context.serviceTypeId, context.planId, null)
  );
  const client = useQueryClient();
  const [preferences] = useReducer(
    (current: LineupPreferencesStore) => current,
    undefined,
    () =>
      new LineupPreferencesStore(
        scope,
        context.serviceTypeId,
        context.planId,
        AsyncStorage
      )
  );
  const layout = useSyncExternalStore(
    preferences.subscribe,
    preferences.getSnapshot
  );
  useEffect(() => {
    void runAction(preferences.restore);
  }, [preferences]);
  const ordered = applyLineupColumnOrder(groups.data ?? [], [...layout.order]);
  const collapsed = new Set(layout.collapsed);
  const nextOpen = findNextOpenPosition(ordered, null);
  const [addingTeam, setAddingTeam] = useState<string | null>(null);
  const [positionName, setPositionName] = useState("");
  const openPosition = (
    teamId: string,
    positionId: string,
    name?: string,
    source?: TeamPosition["source"]
  ): void => {
    router.push({
      pathname: "/services/[serviceTypeId]/plans/[planId]/assign",
      params: {
        serviceTypeId: context.serviceTypeId,
        planId: context.planId,
        teamId,
        positionId,
        positionName: name,
        source,
      },
    });
  };
  const addPosition = (): void => {
    if (addingTeam === null || !context.canSchedule) {
      return;
    }
    const key = queryKeys.teamPositions(
      context.serviceTypeId,
      context.planId,
      null
    );
    const addition = addCustomLineupPosition(
      client.getQueryData<TeamPositionGroup[]>(key) ?? groups.data ?? [],
      addingTeam,
      positionName
    );
    if (addition === null) {
      return;
    }
    client.setQueryData(key, addition.groups);
    setAddingTeam(null);
    setPositionName("");
    const position = addition.groups
      .find((group) => group.teamId === addingTeam)
      ?.positions.find((item) => item.id === addition.positionId);
    openPosition(
      addingTeam,
      addition.positionId,
      position?.name,
      position?.source
    );
  };
  const [selected, setSelected] = useState<FilledPositionPerson | null>(null);
  const needed = useRpcMutation("neededPositions.adjust");
  const adjust = (position: TeamPosition, change: "add" | "remove") => {
    needed.mutate({
      ...context,
      teamId: position.teamId,
      positionName: position.name,
      change,
    });
  };
  return (
    <ReadState query={groups}>
      <LineupLayoutControls
        groups={ordered}
        collapsed={collapsed}
        busy={!layout.ready || layout.busy}
        onCollapse={(ids) => {
          void runAction(async () => {
            await preferences.setCollapsed(ids);
          });
        }}
        onOrder={(ids) => {
          void runAction(async () => {
            await preferences.setOrder(ids);
          });
        }}
      />
      {context.canSchedule ? (
        <Action
          label="Fill next open"
          disabled={nextOpen === null}
          onPress={() => {
            if (nextOpen !== null) {
              openPosition(nextOpen.teamId, nextOpen.positionId);
            }
          }}
        />
      ) : null}
      {ordered.map((group) => (
        <LineupTeam
          key={group.teamId}
          group={group}
          collapsed={collapsed.has(group.teamId)}
          busy={!layout.ready || layout.busy}
          onToggle={() => {
            const next = collapsed.has(group.teamId)
              ? layout.collapsed.filter((id) => id !== group.teamId)
              : [...layout.collapsed, group.teamId];
            void runAction(async () => {
              await preferences.setCollapsed(next);
            });
          }}
          onAdd={
            context.canSchedule
              ? () => {
                  setAddingTeam(group.teamId);
                  setPositionName("");
                }
              : undefined
          }
        >
          {group.positions.map((position) => (
            <LineupPosition
              key={position.id}
              position={position}
              canSchedule={context.canSchedule}
              onSelect={setSelected}
              onAssign={() => {
                openPosition(
                  group.teamId,
                  position.id,
                  position.name,
                  position.source
                );
              }}
              onAdjust={(change) => {
                adjust(position, change);
              }}
            />
          ))}
        </LineupTeam>
      ))}
      <Editor
        label="Add position"
        visible={addingTeam !== null}
        onClose={() => {
          setAddingTeam(null);
        }}
      >
        <Label secondary>
          A position for this plan only. Planning Center creates it when you
          schedule someone.
        </Label>
        <Field
          label="Position name"
          value={positionName}
          onChangeText={setPositionName}
        />
        <Action
          label="Add position and choose someone"
          disabled={!positionName.trim() || !context.canSchedule}
          onPress={() => {
            addPosition();
          }}
        />
      </Editor>
      {selected === null ? null : (
        <LineupPersonEditor
          key={selected.planPersonId}
          context={context}
          person={selected}
          onClosed={() => {
            setSelected(null);
          }}
        />
      )}
    </ReadState>
  );
};

export const Lineup = ({ context }: { context: PlanContext }) => {
  const { scope } = useSession();
  return (
    <LineupWorkspace
      key={`${scope}.${context.serviceTypeId}.${context.planId}`}
      context={context}
      scope={scope}
    />
  );
};
