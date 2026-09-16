"use client";

import { ChevronDown, Plus } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

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
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { TeamPosition, TeamPositionGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TeamSlotsCollapsible({
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
}) {
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
        <SidebarMenuButton
          isActive={active}
          onClick={() => onSelect(slot)}
          onMouseEnter={() => onPreview?.(slot)}
          onFocus={() => onPreview?.(slot)}
          className="h-8 rounded-none pr-2 pl-5 transition-none"
        >
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className={cn("truncate", isTemporaryPosition && "italic")}>
              {position.name}
            </span>
          </span>
          <SlotBadgeCluster
            position={position}
            teamName={group.teamName}
            positionName={position.name}
          />
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  useEffect(() => {
    if (addOpen) inputRef.current?.focus();
  }, [addOpen]);

  const handleAddPosition = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = positionName.trim();
    if (!trimmedName || !onAddPosition) return;
    const slot = onAddPosition(
      { teamId: group.teamId, teamName: group.teamName },
      trimmedName
    );
    if (!slot) return;
    setPositionName("");
    setAddOpen(false);
    onSelect(slot);
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={() => onToggle(group.teamId)}
      asChild
    >
      <SidebarGroup className="border-sidebar-border/40 border-t px-0 py-0 first:border-0">
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel
            asChild
            className="group/team-label hover:bg-sidebar-accent/50 h-9 w-full cursor-pointer justify-start gap-2 rounded-none px-2.5 text-left"
          >
            <button type="button">
              <span className="flex-1 truncate text-left text-sm font-semibold">
                {group.teamName}
              </span>
              {openNeededCount > 0 ? (
                <span className="text-[11px] font-medium text-red-600 tabular-nums dark:text-red-400">
                  {openNeededCount}
                </span>
              ) : (
                <span
                  className="size-1.5 rounded-full bg-emerald-500/70"
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
            </button>
          </SidebarGroupLabel>
        </CollapsibleTrigger>

        {!isOpen && selectedPositionInGroup ? (
          <SidebarGroupContent>
            <SidebarMenu className="gap-0">
              {renderPositionRow(selectedPositionInGroup)}
            </SidebarMenu>
          </SidebarGroupContent>
        ) : null}

        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0">
              {group.positions.map(renderPositionRow)}
              {onAddPosition ? (
                <SidebarMenuItem>
                  <Popover open={addOpen} onOpenChange={setAddOpen}>
                    <PopoverTrigger asChild>
                      <SidebarMenuButton className="text-sidebar-foreground/45 hover:bg-sidebar-accent/25 hover:text-sidebar-foreground/65 data-[state=open]:bg-sidebar-accent/25 data-[state=open]:text-sidebar-foreground/65 h-7 rounded-none pr-2 pl-5 transition-none">
                        <Plus
                          className="size-3 shrink-0 opacity-70"
                          aria-hidden
                        />
                        <span className="truncate text-[13px] font-normal">
                          Add position
                        </span>
                      </SidebarMenuButton>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      side="right"
                      sideOffset={8}
                      collisionPadding={16}
                      className="w-[min(18rem,calc(100vw-2rem))] p-2"
                    >
                      <form className="flex gap-2" onSubmit={handleAddPosition}>
                        <Input
                          ref={inputRef}
                          value={positionName}
                          onChange={(event) =>
                            setPositionName(event.target.value)
                          }
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
}
