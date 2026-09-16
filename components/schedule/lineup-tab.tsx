"use client";

import { CalendarDays } from "lucide-react";

import { PersonRehearsalTimesPopover } from "@/components/schedule/person-rehearsal-times-popover";
import type { SlotRef } from "@/components/schedule/types";
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getInitials } from "@/lib/format/initials";
import type {
  FilledPositionPerson,
  PlanTime,
  TeamPosition,
  TeamPositionGroup,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface LineupTabProps {
  groups: TeamPositionGroup[];
  isLoading: boolean;
  isPlaceholderData: boolean;
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
  planTimes: PlanTime[];
  onSelectPosition: (slot: SlotRef) => void;
  onPreviewPosition?: (slot: SlotRef) => void;
}

export function LineupTab({
  groups,
  isLoading,
  isPlaceholderData,
  serviceTypeId,
  planId,
  seriesId,
  planTimes,
  onSelectPosition,
  onPreviewPosition,
}: LineupTabProps) {
  if (isLoading) {
    return (
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-w-max items-start gap-6 pr-4 pb-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-80 w-[420px]" />
          ))}
        </div>
      </ScrollArea>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed px-4 py-10 text-center text-sm">
        No slots found for this plan.
      </div>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="relative" aria-busy={isPlaceholderData}>
        {isPlaceholderData ? (
          <div className="border-border/60 bg-background/95 text-muted-foreground sticky top-0 left-0 z-10 mb-2 w-fit rounded-md border px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
            Loading selected plan...
          </div>
        ) : null}
        <div
          className={cn(
            "flex min-w-max items-start gap-6 pr-4 pb-3",
            isPlaceholderData && "pointer-events-none opacity-60"
          )}
        >
          {groups.map((group) => (
            <TeamColumn
              key={group.teamId}
              group={group}
              serviceTypeId={serviceTypeId}
              planId={planId}
              seriesId={seriesId}
              planTimes={planTimes}
              onSelectPosition={onSelectPosition}
              onPreviewPosition={onPreviewPosition}
            />
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}

function TeamColumn({
  group,
  serviceTypeId,
  planId,
  seriesId,
  planTimes,
  onSelectPosition,
  onPreviewPosition,
}: {
  group: TeamPositionGroup;
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
  planTimes: PlanTime[];
  onSelectPosition: (slot: SlotRef) => void;
  onPreviewPosition?: (slot: SlotRef) => void;
}) {
  const totalScheduled = group.positions.reduce(
    (sum, position) =>
      sum +
      (position.filledConfirmedCount ?? 0) +
      (position.filledPendingCount ?? 0),
    0
  );
  const totalNeeded = group.positions.reduce(
    (sum, position) => sum + (position.neededCount ?? 0),
    0
  );

  return (
    <section className="w-[380px] shrink-0">
      <div className="border-border/40 bg-card/50 overflow-hidden rounded-lg border">
        <header className="border-border/40 flex items-baseline justify-between gap-2 border-b px-3 py-2">
          <h3 className="truncate text-sm font-semibold tracking-tight">
            {group.teamName}
          </h3>
          <p className="text-muted-foreground text-xs tabular-nums">
            {totalNeeded > 0
              ? `${totalScheduled}/${totalNeeded}`
              : `${totalScheduled}`}
          </p>
        </header>

        <Accordion
          type="multiple"
          defaultValue={group.positions.map((position) => position.id)}
          className="w-full px-2 py-0.5"
        >
          {group.positions.map((position, index) => (
            <div key={position.id}>
              <PositionAccordionItem
                teamId={group.teamId}
                teamName={group.teamName}
                position={position}
                serviceTypeId={serviceTypeId}
                planId={planId}
                seriesId={seriesId}
                planTimes={planTimes}
                onSelectPosition={onSelectPosition}
                onPreviewPosition={onPreviewPosition}
              />
              {index < group.positions.length - 1 ? (
                <Separator className="opacity-30" />
              ) : null}
            </div>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

function PositionAccordionItem({
  teamId,
  teamName,
  position,
  serviceTypeId,
  planId,
  seriesId,
  planTimes,
  onSelectPosition,
  onPreviewPosition,
}: {
  teamId: string;
  teamName: string;
  position: TeamPosition;
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
  planTimes: PlanTime[];
  onSelectPosition: (slot: SlotRef) => void;
  onPreviewPosition?: (slot: SlotRef) => void;
}) {
  const confirmed = position.filledConfirmedCount ?? 0;
  const pending = position.filledPendingCount ?? 0;
  const scheduledCount = confirmed + pending;
  const needed = position.neededCount ?? 0;
  const total = scheduledCount + needed;
  const people = position.filledPeople ?? [];
  const isTemporaryPosition =
    !!position.source && position.source !== "team_position";
  const slot = {
    teamId,
    teamName,
    positionId: position.id,
    positionName: position.name,
  };

  return (
    <AccordionItem
      value={position.id}
      className="hover:bg-muted/40 rounded-sm border-b-0 transition-colors"
    >
      <AccordionHeader className="rounded-none px-1 py-0">
        <AccordionTrigger className="min-w-0 flex-1 gap-1 rounded-none py-2 hover:no-underline">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                "truncate text-sm font-medium",
                isTemporaryPosition && "italic"
              )}
            >
              {position.name}
            </span>
            <span className="text-muted-foreground text-[11px] tabular-nums">
              {needed > 0 ? `${scheduledCount}/${total}` : `${scheduledCount}`}
            </span>
            {needed > 0 ? (
              <span className="text-[11px] font-medium text-red-600 tabular-nums dark:text-red-400">
                +{needed}
              </span>
            ) : null}
          </div>
        </AccordionTrigger>
        <button
          type="button"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "text-muted-foreground hover:text-foreground size-7 shrink-0"
          )}
          title={`Open ${position.name} in scheduler`}
          aria-label={`Open ${position.name} in scheduler`}
          onPointerEnter={() => onPreviewPosition?.(slot)}
          onFocus={() => onPreviewPosition?.(slot)}
          onTouchStart={() => onPreviewPosition?.(slot)}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSelectPosition(slot);
          }}
        >
          <CalendarDays className="size-3.5" />
        </button>
      </AccordionHeader>

      <AccordionContent
        className="cursor-pointer pt-0 pb-3"
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (
            target.closest(
              "button, a, input, textarea, select, [role='button'], [data-slot='popover-content'], [data-slot='command-item'], [cmdk-item]"
            )
          ) {
            return;
          }

          const trigger = event.currentTarget
            .closest("[data-slot='accordion-item']")
            ?.querySelector<HTMLButtonElement>(
              "[data-slot='accordion-trigger']"
            );
          trigger?.click();
        }}
      >
        {people.length === 0 ? (
          <p className="text-muted-foreground pl-1 text-xs">No one</p>
        ) : (
          <ul className="space-y-1.5 pl-1">
            {people.map((person) => (
              <PersonRow
                key={`${position.id}-${person.id}-${person.rawStatus}`}
                person={person}
                serviceTypeId={serviceTypeId}
                planId={planId}
                seriesId={seriesId}
                planTimes={planTimes}
              />
            ))}
          </ul>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function PersonRow({
  person,
  serviceTypeId,
  planId,
  seriesId,
  planTimes,
}: {
  person: FilledPositionPerson;
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
  planTimes: PlanTime[];
}) {
  return (
    <li
      className="flex items-center gap-2 text-sm"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Avatar className="h-6 w-6">
        <AvatarImage
          src={person.photoThumbnailUrl || undefined}
          alt={person.name}
        />
        <AvatarFallback className="text-[10px]">
          {getInitials(person.name)}
        </AvatarFallback>
      </Avatar>

      <span className="truncate">{person.name}</span>
      <PersonRehearsalTimesPopover
        person={person}
        serviceTypeId={serviceTypeId}
        planId={planId}
        seriesId={seriesId}
        planTimes={planTimes}
      />
      <span
        className={cn(
          "ml-auto size-2 shrink-0 rounded-full",
          person.status === "confirmed" ? "bg-green-500" : "bg-amber-500"
        )}
        title={person.status === "confirmed" ? "Confirmed" : "Pending"}
      />
    </li>
  );
}
