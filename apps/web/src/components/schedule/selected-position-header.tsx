"use client";

import type { TeamPosition } from "@pcobooster/planning-center-models/types";
import { ChevronLeft, ChevronsUpDown, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

export const SelectedPositionHeader = ({
  info,
  onOpenPicker,
  onBack,
  hasSlots,
  teamPositionsLoading,
  filter,
  onFilterChange,
}: {
  info: {
    teamName: string;
    positionName: string;
    position: TeamPosition;
  } | null;
  onOpenPicker: () => void;
  onBack: () => void;
  hasSlots: boolean;
  teamPositionsLoading: boolean;
  filter: string;
  onFilterChange: (next: string) => void;
}) => {
  const isTemporaryPosition =
    !!info?.position.source && info.position.source !== "team_position";

  return (
    <div className="flex shrink-0 flex-col gap-2 px-1 sm:gap-3">
      <div className="flex items-center gap-1 lg:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="-ml-2 shrink-0 max-md:hidden"
          onClick={onBack}
          aria-label="Back to positions"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </Button>
        <button
          type="button"
          className="active:bg-muted -mx-1.5 flex min-w-0 flex-1 items-center gap-1.5 rounded-xl px-1.5 py-1 text-left disabled:opacity-60 md:mx-0"
          onClick={onOpenPicker}
          disabled={!hasSlots || teamPositionsLoading}
          aria-label="Change position"
        >
          <span className="flex min-w-0 flex-col">
            <span
              className={cn(
                "truncate text-lg leading-tight font-semibold tracking-tight",
                isTemporaryPosition && "italic"
              )}
            >
              {info?.positionName ?? "Position"}
            </span>
            {info ? (
              <span className="text-muted-foreground truncate text-xs">
                {info.teamName}
              </span>
            ) : null}
          </span>
          <ChevronsUpDown
            className="text-muted-foreground size-4 shrink-0"
            aria-hidden
          />
        </button>
      </div>

      <p
        className={cn(
          "min-w-0 truncate text-2xl leading-tight font-semibold tracking-tight max-lg:hidden",
          isTemporaryPosition && "italic"
        )}
      >
        {info?.positionName ?? "Position"}
      </p>

      <div className="flex items-center gap-3">
        <InputGroup className="w-full flex-1 sm:max-w-sm">
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            value={filter}
            onChange={(event) => {
              onFilterChange(event.target.value);
            }}
            placeholder="Filter people"
            aria-label="Filter people"
          />
          {filter ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label="Clear filter"
                onClick={() => {
                  onFilterChange("");
                }}
              >
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      </div>
    </div>
  );
};
