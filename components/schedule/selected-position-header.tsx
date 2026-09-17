"use client";

import { ChevronsUpDown, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import type { TeamPosition } from "@/lib/types";
import { cn } from "@/lib/utils";

export const SelectedPositionHeader = ({
  info,
  onOpenPicker,
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
  hasSlots: boolean;
  teamPositionsLoading: boolean;
  filter: string;
  onFilterChange: (next: string) => void;
}) => {
  const isTemporaryPosition =
    !!info?.position.source && info.position.source !== "team_position";

  return (
    <div className="flex shrink-0 flex-col gap-2 px-1 sm:gap-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <p
            className={cn(
              "min-w-0 truncate text-xl leading-tight font-semibold tracking-tight sm:text-2xl",
              isTemporaryPosition && "italic"
            )}
          >
            {info?.positionName ?? "Position"}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 lg:hidden"
          onClick={onOpenPicker}
          disabled={!hasSlots || teamPositionsLoading}
          title="Change position"
          aria-label="Change position"
        >
          <span>Positions</span>
          <ChevronsUpDown className="size-3.5 opacity-60" aria-hidden />
        </Button>
      </div>

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
            placeholder="Filter"
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
