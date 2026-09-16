"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/format/initials";
import type { FilledPositionPerson } from "@/lib/types";
import { cn } from "@/lib/utils";

const FilledPeopleSection = ({
  label,
  tone,
  people,
  emptyMessage,
}: {
  label: string;
  tone: "confirmed" | "pending";
  people: FilledPositionPerson[];
  emptyMessage: string;
}) => (
  <div className="space-y-2">
    <div className="flex items-center gap-2">
      <Badge variant={tone === "confirmed" ? "slot-confirmed" : "slot-pending"}>
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
                ? "border-status-confirmed-bright/55 bg-status-confirmed/28 dark:bg-status-confirmed-deep/50"
                : "border-status-scheduled-bright/55 bg-status-scheduled/28 dark:bg-status-scheduled-deep/50"
            )}
          >
            <Avatar className="h-7 w-7">
              <AvatarImage
                src={person.photoThumbnailUrl ?? undefined}
                alt={person.name}
              />
              <AvatarFallback size="tiny">
                {getInitials(person.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{person.name}</p>
              <p
                className={cn(
                  "text-xs font-medium",
                  person.status === "confirmed"
                    ? "text-status-confirmed dark:text-primary-foreground"
                    : "text-status-scheduled dark:text-primary-foreground"
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

export const SlotStatusPopoverContent = ({
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
}) => (
  <div className="space-y-3">
    <div>
      <p className="text-sm font-semibold">{positionName}</p>
      <p className="text-muted-foreground text-xs">{teamName}</p>
    </div>
    <FilledPeopleSection
      label={label}
      tone={tone}
      people={people}
      emptyMessage={`No ${label.toLowerCase()} people here yet`}
    />
  </div>
);
