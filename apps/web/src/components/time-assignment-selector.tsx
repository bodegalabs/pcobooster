"use client";

import { UnfoldMoreIcon, UsersIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  FilledPositionPerson,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import { useId, useMemo, useState } from "react";

import {
  PositionPickerIcon,
  TeamPickerIcon,
} from "@/components/schedule/position-picker-icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandList,
} from "@/components/ui/command";
import { ItemSeparator } from "@/components/ui/item";
import { MiddleTruncate } from "@/components/ui/middle-truncate";
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from "@/components/ui/responsive-popover";
import {
  SelectionPickerCheckbox,
  SelectionPickerCommandItem,
  SelectionPickerShell,
} from "@/components/ui/selection-picker";
import { selectionPickerSectionTitleClass } from "@/components/ui/selection-picker-styles";
import { getInitials } from "@/lib/format/initials";

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
  const allTeamsSelected =
    groups.length > 0 && value.teamIds.length === groups.length;
  const hasSelection =
    value.teamIds.length > 0 ||
    value.positionIds.length > 0 ||
    value.neededPositionIds.length > 0 ||
    value.planPersonIds.length > 0;

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
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger
        render={
          <Button
            type="button"
            variant="input"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={listId}
            disabled={disabled}
            className="w-full justify-between"
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          <HugeiconsIcon
            icon={UsersIcon}
            strokeWidth={2}
            className="text-muted-foreground size-4 shrink-0"
          />
          <span className="truncate text-left">{label}</span>
        </span>
        <HugeiconsIcon
          icon={UnfoldMoreIcon}
          strokeWidth={2}
          className="text-muted-foreground pointer-events-none size-4 shrink-0"
          aria-hidden
        />
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        title="Assignments"
        className="w-[420px] max-w-[calc(100vw-2rem)]"
        align="start"
      >
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-muted-foreground text-xs">{label}</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={groups.length === 0 || allTeamsSelected}
              onClick={() => {
                setTeams(groups.map((group) => group.teamId));
              }}
            >
              All teams
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={!hasSelection}
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
        <ItemSeparator className="my-0" />
        <Command>
          <CommandInput placeholder="Search teams, slots, positions, or people..." />
          <CommandList id={listId} className="max-h-[420px]">
            <CommandEmpty>No assignments found.</CommandEmpty>
            <div className="flex flex-col gap-3 p-1.5">
              {groups.length > 0 ? (
                <section className="flex flex-col gap-2.5">
                  <h3 className={selectionPickerSectionTitleClass}>Teams</h3>
                  <SelectionPickerShell>
                    {groups.map((group) => {
                      const selected = selectedTeamIds.has(group.teamId);

                      return (
                        <SelectionPickerCommandItem
                          key={group.teamId}
                          selected={selected}
                          value={`${group.teamName} ${group.teamId}`}
                          onSelect={() => {
                            setTeams(toggleId(value.teamIds, group.teamId));
                          }}
                        >
                          <SelectionPickerCheckbox
                            selected={selected}
                            className="mt-0"
                          />
                          <TeamPickerIcon teamName={group.teamName} />
                          <span className="min-w-0 flex-1 truncate">
                            {group.teamName}
                          </span>
                          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                            {group.positions.length}
                          </span>
                        </SelectionPickerCommandItem>
                      );
                    })}
                  </SelectionPickerShell>
                </section>
              ) : null}

              {positions.length > 0 ? (
                <section className="flex flex-col gap-2.5">
                  <h3 className={selectionPickerSectionTitleClass}>
                    Positions and plan slots
                  </h3>
                  <SelectionPickerShell>
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

                      return (
                        <SelectionPickerCommandItem
                          key={`${position.source}:${position.id}`}
                          selected={selected}
                          value={`${position.teamName} ${position.name} ${position.id}`}
                          onSelect={() => {
                            if (isNeeded && neededPositionId !== undefined) {
                              setNeededPositions(
                                toggleId(
                                  value.neededPositionIds,
                                  neededPositionId
                                )
                              );
                              return;
                            }
                            if (position.source === "team_position") {
                              setPositions(
                                toggleId(value.positionIds, position.id)
                              );
                            }
                          }}
                          disabled={
                            position.source !== "team_position" && !isNeeded
                          }
                        >
                          <SelectionPickerCheckbox
                            selected={selected}
                            className="mt-0"
                          />
                          <PositionPickerIcon
                            positionName={position.name}
                            teamName={position.teamName}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block min-w-0 text-sm font-medium">
                              <MiddleTruncate text={position.name} />
                            </span>
                            <span className="text-muted-foreground block truncate text-xs">
                              {position.teamName}
                            </span>
                          </span>
                        </SelectionPickerCommandItem>
                      );
                    })}
                  </SelectionPickerShell>
                </section>
              ) : null}

              {memberRows.length > 0 ? (
                <section className="flex flex-col gap-2.5">
                  <h3 className={selectionPickerSectionTitleClass}>People</h3>
                  <SelectionPickerShell>
                    {memberRows.map((person) => {
                      const selected = selectedPlanPersonIds.has(
                        person.planPersonId
                      );

                      return (
                        <SelectionPickerCommandItem
                          key={person.planPersonId}
                          selected={selected}
                          value={`${person.name} ${person.teamName} ${person.positionName}`}
                          onSelect={() => {
                            setPlanPeople(
                              toggleId(value.planPersonIds, person.planPersonId)
                            );
                          }}
                        >
                          <SelectionPickerCheckbox
                            selected={selected}
                            className="mt-0"
                          />
                          <Avatar size="sm" className="shrink-0">
                            <AvatarImage
                              src={person.photoThumbnailUrl ?? undefined}
                              alt={person.name}
                            />
                            <AvatarFallback>
                              {getInitials(person.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {person.name}
                            </span>
                            <span className="text-muted-foreground block truncate text-xs">
                              {person.teamName} / {person.positionName}
                            </span>
                          </span>
                        </SelectionPickerCommandItem>
                      );
                    })}
                  </SelectionPickerShell>
                </section>
              ) : null}
            </div>
          </CommandList>
        </Command>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  );
};
