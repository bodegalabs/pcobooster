"use client";

import { ChevronDown, Plus } from "lucide-react";
import type { SubmitEvent as ReactSubmitEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { PositionPickerIcon } from "@/components/schedule/position-picker-icon";
import { PositionPickerRow } from "@/components/schedule/position-picker-row";
import { SlotBadgeCluster } from "@/components/schedule/slot-badge-cluster";
import type { SlotRef } from "@/components/schedule/types";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { TeamPosition, TeamPositionGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

export const TeamSlotsCollapsible = ({
  group,
  isCollapsed,
  selectedTeam,
  selectedPosition,
  onToggle,
  onSelect,
  onPreview,
  onAddPosition,
}: {
  group: TeamPositionGroup;
  isCollapsed: boolean;
  selectedTeam: string | null;
  selectedPosition: string | null;
  onToggle: (teamId: string) => void;
  onSelect: (slot: SlotRef) => void;
  onPreview?: (slot: SlotRef) => void;
  onAddPosition?: (
    team: { teamId: string; teamName: string },
    positionName: string
  ) => SlotRef | null;
}) => {
  const [addOpen, setAddOpen] = useState(false);
  const [positionName, setPositionName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const openNeededCount = group.positions.reduce(
    (sum, position) => sum + (position.neededCount ?? 1),
    0
  );
  const selectedPositionInGroup =
    group.teamId === selectedTeam
      ? (group.positions.find((position) => position.id === selectedPosition) ??
        null)
      : null;
  const isOpen = !isCollapsed;

  const renderPositionRow = (position: TeamPosition) => {
    const isTemporaryPosition =
      !!position.source && position.source !== "team_position";
    const active =
      group.teamId === selectedTeam && position.id === selectedPosition;
    const slot = {
      teamId: group.teamId,
      teamName: group.teamName,
      positionId: position.id,
      positionName: position.name,
      source: position.source,
    };
    return (
      <SidebarMenuItem key={position.id}>
        <PositionPickerRow
          active={active}
          onClick={() => {
            onSelect(slot);
          }}
          onMouseEnter={() => onPreview?.(slot)}
          onFocus={() => onPreview?.(slot)}
        >
          <PositionPickerIcon
            positionName={position.name}
            teamName={group.teamName}
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              isTemporaryPosition && "italic"
            )}
          >
            {position.name}
          </span>
          <SlotBadgeCluster
            position={position}
            teamName={group.teamName}
            positionName={position.name}
          />
        </PositionPickerRow>
      </SidebarMenuItem>
    );
  };

  useEffect(() => {
    if (addOpen) {
      inputRef.current?.focus();
    }
  }, [addOpen]);

  const handleAddPosition = (event: ReactSubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = positionName.trim();
    if (!trimmedName || !onAddPosition) {
      return;
    }
    const slot = onAddPosition(
      { teamId: group.teamId, teamName: group.teamName },
      trimmedName
    );
    if (!slot) {
      return;
    }
    setPositionName("");
    setAddOpen(false);
    onSelect(slot);
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={() => {
        onToggle(group.teamId);
      }}
    >
      <SidebarGroup>
        <CollapsibleTrigger
          render={
            <SidebarGroupLabel className="group/team-label w-full cursor-pointer justify-start text-left" />
          }
          nativeButton={false}
        >
          <span className="flex-1 truncate text-left">{group.teamName}</span>
          {openNeededCount > 0 ? (
            <span className="text-status-declined dark:text-status-declined text-xs font-medium tabular-nums">
              {openNeededCount}
            </span>
          ) : (
            <span
              className="bg-status-confirmed-bright/70 size-1.5 rounded-full"
              aria-label="All set"
            />
          )}
          <ChevronDown
            className={cn(
              "text-muted-foreground size-3.5 shrink-0 transition-transform duration-200 ease-out",
              isCollapsed && "-rotate-90"
            )}
            aria-hidden
          />
        </CollapsibleTrigger>

        {!isOpen && selectedPositionInGroup ? (
          <SidebarGroupContent>
            <SidebarMenu>
              {renderPositionRow(selectedPositionInGroup)}
            </SidebarMenu>
          </SidebarGroupContent>
        ) : null}

        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.positions.map(renderPositionRow)}
              {onAddPosition ? (
                <SidebarMenuItem>
                  <Popover open={addOpen} onOpenChange={setAddOpen}>
                    <PopoverTrigger render={<PositionPickerRow tone="muted" />}>
                      <Plus
                        className="size-3.5 shrink-0 opacity-70"
                        aria-hidden
                      />
                      <span className="truncate font-normal">Add position</span>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      side="right"
                      sideOffset={8}
                      className="w-[min(18rem,calc(100vw-2rem))]"
                    >
                      <form
                        className="flex gap-2 p-3"
                        onSubmit={handleAddPosition}
                      >
                        <Input
                          ref={inputRef}
                          value={positionName}
                          onChange={(event) => {
                            setPositionName(event.target.value);
                          }}
                          placeholder="Position name"
                          className="h-8"
                        />
                        <Button
                          type="submit"
                          size="sm"
                          disabled={!positionName.trim()}
                        >
                          Add
                        </Button>
                      </form>
                    </PopoverContent>
                  </Popover>
                </SidebarMenuItem>
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
};
