"use client";

import {
  Check,
  ChevronsUpDown,
  CircleUserRound,
  Rows3,
  Users,
} from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FilledPositionPerson, TeamPositionGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface TimeAssignmentValue {
  teamIds: string[];
  positionIds: string[];
  neededPositionIds: string[];
  planPersonIds: string[];
}

interface TimeAssignmentSelectorProps {
  groups: TeamPositionGroup[];
  value: TimeAssignmentValue;
  onChange: (value: TimeAssignmentValue) => void;
  disabled?: boolean;
}

interface PositionOption {
  id: string;
  name: string;
  teamName: string;
  teamId: string;
  source: "team_position" | "needed_position" | "plan_member" | "custom";
  neededPositionId?: string;
  filledPeople: FilledPositionPerson[];
}

const unique = (values: string[]): string[] => [...new Set(values)];

const buildPositionOptions = (groups: TeamPositionGroup[]): PositionOption[] =>
  groups.flatMap((group) =>
    group.positions.map((position) => ({
      id: position.id,
      name: position.name,
      teamName: group.teamName,
      teamId: group.teamId,
      source: position.source ?? "team_position",
      neededPositionId: position.neededPositionId,
      filledPeople: position.filledPeople ?? [],
    }))
  );

const formatCount = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`;

const buildMemberRows = (positions: PositionOption[]) =>
  positions.flatMap((position) =>
    position.filledPeople.map((person) => ({
      ...person,
      positionName: position.name,
      teamName: position.teamName,
    }))
  );

const buildLabel = (
  groups: TeamPositionGroup[],
  positions: PositionOption[],
  value: TimeAssignmentValue
) => {
  const memberRows = buildMemberRows(positions);
  const positionCount =
    value.positionIds.length + value.neededPositionIds.length;
  const count =
    value.teamIds.length + positionCount + value.planPersonIds.length;
  if (count === 0) {
    return "No assignments";
  }
  if (
    value.teamIds.length === groups.length &&
    groups.length > 0 &&
    positionCount === 0 &&
    value.planPersonIds.length === 0
  ) {
    return "All teams";
  }

  const firstTeam = groups.find(
    (group) => group.teamId === value.teamIds[0]
  )?.teamName;
  const firstPosition = positions.find(
    (position) => position.id === value.positionIds[0]
  )?.name;
  const firstNeeded = positions.find(
    (position) => position.neededPositionId === value.neededPositionIds[0]
  )?.name;
  const firstPerson = memberRows.find(
    (person) => person.planPersonId === value.planPersonIds[0]
  )?.name;
  const first = firstTeam ?? firstPosition ?? firstNeeded ?? firstPerson;
  if (count === 1 && first !== undefined && first !== "") {
    return first;
  }
  return [
    value.teamIds.length > 0
      ? formatCount(value.teamIds.length, "team", "teams")
      : null,
    positionCount > 0
      ? formatCount(positionCount, "position", "positions")
      : null,
    value.planPersonIds.length > 0
      ? formatCount(value.planPersonIds.length, "person", "people")
      : null,
  ]
    .filter(Boolean)
    .join(", ");
};

const toggleId = (ids: string[], id: string): string[] =>
  ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];

export const TimeAssignmentSelector = ({
  groups,
  value,
  onChange,
  disabled = false,
}: TimeAssignmentSelectorProps) => {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const positions = useMemo(() => buildPositionOptions(groups), [groups]);
  const label = buildLabel(groups, positions, value);
  const selectedTeamIds = useMemo(
    () => new Set(value.teamIds),
    [value.teamIds]
  );
  const selectedPositionIds = useMemo(
    () => new Set(value.positionIds),
    [value.positionIds]
  );
  const selectedNeededPositionIds = useMemo(
    () => new Set(value.neededPositionIds),
    [value.neededPositionIds]
  );
  const selectedPlanPersonIds = useMemo(
    () => new Set(value.planPersonIds),
    [value.planPersonIds]
  );
  const memberRows = useMemo(() => buildMemberRows(positions), [positions]);

  const setTeams = (teamIds: string[]) => {
    onChange({ ...value, teamIds: unique(teamIds) });
  };
  const setPositions = (positionIds: string[]) => {
    onChange({ ...value, positionIds: unique(positionIds) });
  };
  const setNeededPositions = (neededPositionIds: string[]) => {
    onChange({ ...value, neededPositionIds: unique(neededPositionIds) });
  };
  const setPlanPeople = (planPersonIds: string[]) => {
    onChange({ ...value, planPersonIds: unique(planPersonIds) });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          className="w-full justify-between"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Users data-icon="inline-start" />
            <span className="truncate text-left">{label}</span>
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        density="flush"
        className="w-[520px] max-w-[calc(100vw-2rem)]"
        align="start"
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-muted-foreground text-xs">{label}</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="tiny"
              disabled={
                groups.length === 0 || value.teamIds.length === groups.length
              }
              onClick={() => {
                setTeams(groups.map((group) => group.teamId));
              }}
            >
              All teams
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="tiny"
              disabled={
                value.teamIds.length === 0 &&
                value.positionIds.length === 0 &&
                value.neededPositionIds.length === 0 &&
                value.planPersonIds.length === 0
              }
              onClick={() => {
                onChange({
                  teamIds: [],
                  positionIds: [],
                  neededPositionIds: [],
                  planPersonIds: [],
                });
              }}
            >
              Clear
            </Button>
          </div>
        </div>
        <Command>
          <CommandInput placeholder="Search teams, slots, positions, or people..." />
          <CommandList id={listId} className="max-h-[420px]">
            <CommandEmpty>No assignments found.</CommandEmpty>
            <CommandGroup heading="Teams">
              {groups.map((group) => {
                const selected = selectedTeamIds.has(group.teamId);

                return (
                  <CommandItem
                    key={group.teamId}
                    value={`${group.teamName} ${group.teamId}`}
                    onSelect={() => {
                      setTeams(toggleId(value.teamIds, group.teamId));
                    }}
                  >
                    <Check
                      className={cn(selected ? "opacity-100" : "opacity-0")}
                    />
                    <Users />
                    <span className="min-w-0 flex-1 truncate">
                      {group.teamName}
                    </span>
                    <Badge variant="secondary" weight="normal">
                      {group.positions.length}
                    </Badge>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandGroup heading="Positions and plan slots">
              {positions.map((position) => {
                const { neededPositionId } = position;
                const isNeeded =
                  position.source === "needed_position" &&
                  neededPositionId !== undefined &&
                  neededPositionId !== "";
                const selected =
                  isNeeded && neededPositionId !== undefined
                    ? selectedNeededPositionIds.has(neededPositionId)
                    : selectedPositionIds.has(position.id);
                const rowLabel = isNeeded ? "Plan slot" : "Position";

                return (
                  <CommandItem
                    key={`${position.source}:${position.id}`}
                    value={`${position.teamName} ${position.name} ${position.id}`}
                    onSelect={() => {
                      if (isNeeded && neededPositionId !== undefined) {
                        setNeededPositions(
                          toggleId(value.neededPositionIds, neededPositionId)
                        );
                        return;
                      }
                      if (position.source === "team_position") {
                        setPositions(toggleId(value.positionIds, position.id));
                      }
                    }}
                    disabled={position.source !== "team_position" && !isNeeded}
                  >
                    <Check
                      className={cn(selected ? "opacity-100" : "opacity-0")}
                    />
                    <Rows3 />
                    <span className="min-w-0 flex-1 truncate">
                      {position.teamName} / {position.name}
                    </span>
                    <Badge variant="outline" weight="normal">
                      {rowLabel}
                    </Badge>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {memberRows.length > 0 ? (
              <CommandGroup heading="People">
                {memberRows.map((person) => (
                  <CommandItem
                    key={person.planPersonId}
                    value={`${person.name} ${person.teamName} ${person.positionName}`}
                    onSelect={() => {
                      setPlanPeople(
                        toggleId(value.planPersonIds, person.planPersonId)
                      );
                    }}
                  >
                    <Check
                      className={cn(
                        selectedPlanPersonIds.has(person.planPersonId)
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                    <CircleUserRound />
                    <span className="min-w-0 flex-1 truncate">
                      {person.name}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {person.teamName} / {person.positionName}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
