import type { TeamPosition } from "@pcobooster/planning-center-models/types";
import { ChevronLeft, ChevronsUpDown, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Item } from "@/components/ui/item";
import { MiddleTruncate } from "@/components/ui/middle-truncate";
import { Skeleton } from "@/components/ui/skeleton";
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
  const nameLoading = info === null && teamPositionsLoading;

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
        <Item
          size="row"
          className="-mx-1.5 min-w-0 flex-1 md:mx-0"
          render={
            <button
              type="button"
              disabled={!hasSlots || teamPositionsLoading}
              aria-label="Change position"
            />
          }
          onClick={onOpenPicker}
        >
          <span className="flex min-w-0 flex-col">
            <span
              className={cn(
                "block min-w-0",
                "text-lg leading-tight font-semibold tracking-tight",
                isTemporaryPosition && "italic"
              )}
            >
              {nameLoading ? (
                <Skeleton variant="control" className="my-0.5 h-5 w-36" />
              ) : (
                <MiddleTruncate text={info?.positionName ?? "Position"} />
              )}
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
        </Item>
      </div>

      {nameLoading ? (
        <Skeleton variant="control" className="h-7 w-40 max-lg:hidden" />
      ) : (
        <p
          className={cn(
            "min-w-0 truncate text-2xl leading-tight font-semibold tracking-tight max-lg:hidden",
            isTemporaryPosition && "italic"
          )}
        >
          {info?.positionName ?? "Position"}
        </p>
      )}

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
