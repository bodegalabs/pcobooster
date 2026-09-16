"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/format/initials";
import type { FilledPositionPerson } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SlotStatusPopoverContent({
  teamName,
  positionName,
  label,
  tone,
  people,
}: {
  teamName: string;
  positionName: string;
  label: "Confirmed" | "Pending";
  tone: "confirmed" | "pending";
  people: FilledPositionPerson[];
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">{positionName}</p>
        <p className="text-muted-foreground text-xs">{teamName}</p>
      </div>
      <FilledPeopleSection
        label={label}
        badgeClassName={
          tone === "confirmed"
            ? "border-emerald-400/70 bg-emerald-600/45 font-semibold text-emerald-50 shadow-sm dark:bg-emerald-600/50"
            : "border-amber-400/70 bg-amber-600/45 font-semibold text-amber-50 shadow-sm dark:bg-amber-600/50"
        }
        people={people}
        emptyMessage={`No ${label.toLowerCase()} people here yet`}
      />
    </div>
  );
}

function FilledPeopleSection({
  label,
  badgeClassName,
  people,
  emptyMessage,
}: {
  label: string;
  badgeClassName: string;
  people: FilledPositionPerson[];
  emptyMessage: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={badgeClassName}>
          {label}
        </Badge>
        <span className="text-muted-foreground text-xs">{people.length}</span>
      </div>
      {people.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyMessage}</p>
      ) : (
        <ul className="space-y-1.5">
          {people.map((person) => (
            <li
              key={`${person.id}-${person.rawStatus}`}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2 py-1.5",
                person.status === "confirmed"
                  ? "border-emerald-400/55 bg-emerald-600/28 dark:bg-emerald-950/50"
                  : "border-amber-400/55 bg-amber-600/28 dark:bg-amber-950/50"
              )}
            >
              <Avatar className="h-7 w-7">
                <AvatarImage
                  src={person.photoThumbnailUrl || undefined}
                  alt={person.name}
                />
                <AvatarFallback className="text-[10px]">
                  {getInitials(person.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{person.name}</p>
                <p
                  className={cn(
                    "text-[11px] font-medium",
                    person.status === "confirmed"
                      ? "text-emerald-700 dark:text-emerald-100"
                      : "text-amber-800 dark:text-amber-100"
                  )}
                >
                  {person.status === "confirmed" ? "Confirmed" : "Pending"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
