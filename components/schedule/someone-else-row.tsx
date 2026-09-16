"use client";

import { CalendarPlus, Loader2, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import {
  usePeopleSearch,
  type PeopleSearchResult,
} from "@/hooks/use-people-search";
import { useSchedulePlanPerson } from "@/hooks/use-schedule-plan-person";

interface SomeoneElseRowProps {
  serviceTypeId?: string | null;
  planId?: string | null;
  teamId?: string | null;
  positionId?: string | null;
  teamName?: string | null;
  positionName?: string | null;
  onScheduleSuccess?: () => void;
  onScheduleError?: (message: string) => void;
}

const PEOPLE_SEARCH_DEBOUNCE_MS = 150;

export function SomeoneElseRow({
  serviceTypeId,
  planId,
  teamId,
  positionId,
  teamName,
  positionName,
  onScheduleSuccess,
  onScheduleError,
}: SomeoneElseRowProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedQuery(query),
      PEOPLE_SEARCH_DEBOUNCE_MS
    );
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const search = usePeopleSearch(debouncedQuery);
  const canSchedule = !!serviceTypeId && !!planId && !!teamId && !!positionId;
  const searchResults = search.data ?? [];
  const normalizedQuery = query.trim();
  const normalizedDebouncedQuery = debouncedQuery.trim();
  const searchHasQuery = normalizedQuery.length >= 2;
  const searchInputPending =
    searchHasQuery && normalizedDebouncedQuery !== normalizedQuery;
  const showInitialSearchLoading =
    searchHasQuery &&
    (searchInputPending || (search.isLoading && searchResults.length === 0));
  const showSearchRefreshing =
    searchHasQuery &&
    !searchInputPending &&
    search.isFetching &&
    searchResults.length > 0;

  const closeSearch = () => {
    setOpen(false);
    setQuery("");
    setDebouncedQuery("");
  };

  const handleSuccess = () => {
    onScheduleSuccess?.();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="hover:bg-muted/30 flex w-full items-center gap-3 px-3 py-3 text-left transition-colors"
        >
          <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full sm:size-9">
            <UserPlus className="size-4" aria-hidden />
          </span>
          <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium sm:text-base">
            Someone else...
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        collisionPadding={16}
        className="w-[min(24rem,calc(100vw-2rem))] p-2"
      >
        <SomeoneElseSearchContent
          inputRef={inputRef}
          query={query}
          onQueryChange={setQuery}
          showPrompt={!searchHasQuery}
          showLoading={showInitialSearchLoading}
          showRefreshing={showSearchRefreshing}
          isError={search.isError}
          results={searchResults}
          serviceTypeId={serviceTypeId}
          planId={planId}
          teamId={teamId}
          positionId={positionId}
          teamName={teamName}
          positionName={positionName}
          canSchedule={canSchedule}
          onScheduleSuccess={handleSuccess}
          onOptimisticSchedule={closeSearch}
          onScheduleError={onScheduleError}
        />
      </PopoverContent>
    </Popover>
  );
}

function SomeoneElseSearchContent({
  inputRef,
  query,
  onQueryChange,
  showPrompt,
  showLoading,
  showRefreshing,
  isError,
  results,
  serviceTypeId,
  planId,
  teamId,
  positionId,
  teamName,
  positionName,
  canSchedule,
  onScheduleSuccess,
  onOptimisticSchedule,
  onScheduleError,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (query: string) => void;
  showPrompt: boolean;
  showLoading: boolean;
  showRefreshing: boolean;
  isError: boolean;
  results: PeopleSearchResult[];
  serviceTypeId?: string | null;
  planId?: string | null;
  teamId?: string | null;
  positionId?: string | null;
  teamName?: string | null;
  positionName?: string | null;
  canSchedule: boolean;
  onScheduleSuccess?: () => void;
  onOptimisticSchedule?: () => void;
  onScheduleError?: (message: string) => void;
}) {
  return (
    <Command shouldFilter={false}>
      <CommandInput
        ref={inputRef}
        value={query}
        onValueChange={onQueryChange}
        placeholder="Search people"
      />
      <CommandList className="max-h-72">
        {showPrompt ? (
          <p className="text-muted-foreground px-3 py-2.5 text-sm">
            Type at least 2 characters.
          </p>
        ) : showLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 px-3 py-2.5 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Searching
          </div>
        ) : isError ? (
          <p className="text-destructive px-3 py-2.5 text-sm">Search failed.</p>
        ) : results.length === 0 ? (
          <CommandEmpty>No people found.</CommandEmpty>
        ) : (
          <CommandGroup>
            {showRefreshing ? (
              <div
                className="text-muted-foreground flex items-center gap-2 px-2 py-1.5 text-xs"
                aria-live="polite"
              >
                <Loader2 className="size-3 animate-spin" />
                Searching
              </div>
            ) : null}
            {results.map((person) => (
              <SomeoneElseResultRow
                key={person.id}
                person={person}
                serviceTypeId={serviceTypeId}
                planId={planId}
                teamId={teamId}
                positionId={positionId}
                teamName={teamName}
                positionName={positionName}
                canSchedule={canSchedule}
                onScheduleSuccess={onScheduleSuccess}
                onOptimisticSchedule={onOptimisticSchedule}
                onScheduleError={onScheduleError}
              />
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}

function SomeoneElseResultRow({
  person,
  serviceTypeId,
  planId,
  teamId,
  positionId,
  teamName,
  positionName,
  canSchedule,
  onScheduleSuccess,
  onOptimisticSchedule,
  onScheduleError,
}: {
  person: PeopleSearchResult;
  serviceTypeId?: string | null;
  planId?: string | null;
  teamId?: string | null;
  positionId?: string | null;
  teamName?: string | null;
  positionName?: string | null;
  canSchedule: boolean;
  onScheduleSuccess?: () => void;
  onOptimisticSchedule?: () => void;
  onScheduleError?: (message: string) => void;
}) {
  const { isScheduling, handleSchedule } = useSchedulePlanPerson({
    serviceTypeId,
    planId,
    teamId,
    positionId,
    teamName,
    positionName,
    canSchedule,
    onOptimisticSchedule,
    onScheduleSuccess,
    onScheduleError,
    oneOff: true,
  });
  const initials =
    `${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}` || "?";

  return (
    <CommandItem
      value={`${person.fullName} ${person.id}`}
      onSelect={() => handleSchedule(person)}
      disabled={!canSchedule || isScheduling}
      className="py-2"
    >
      <Avatar className="size-8 shrink-0">
        <AvatarImage
          src={person.photoThumbnailUrl ?? undefined}
          alt={person.fullName}
        />
        <AvatarFallback className="bg-muted text-xs font-medium">
          {initials}
        </AvatarFallback>
      </Avatar>
      <p className="min-w-0 flex-1 truncate text-sm font-medium">
        {person.fullName}
      </p>
      {isScheduling ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <CalendarPlus className="size-3.5 opacity-70" aria-hidden />
      )}
    </CommandItem>
  );
}
