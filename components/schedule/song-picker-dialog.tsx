"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useCallback, useDeferredValue, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { createSongOptionsQueryOptions } from "@/hooks/use-song-options";
import { useSongSearch } from "@/hooks/use-song-search";
import { parseOptionalDate } from "@/lib/song-catalog-client";
import type { SongCatalogEntry } from "@/lib/types";

interface SongPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceTypeId: string | null;
  onSelectSong: (song: SongCatalogEntry) => Promise<void> | void;
  pendingSongId?: string | null;
}

const lastScheduledFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatLastScheduled(date: Date | string | null) {
  const parsedDate = parseOptionalDate(date);
  if (!parsedDate) return null;
  return lastScheduledFormatter.format(parsedDate);
}

export function SongPickerDialog({
  open,
  onOpenChange,
  serviceTypeId,
  onSelectSong,
  pendingSongId = null,
}: SongPickerDialogProps) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const {
    data: songs = [],
    isLoading,
    isFetching,
  } = useSongSearch(serviceTypeId, deferredQuery);
  const showResults = deferredQuery.trim().length > 0;
  const showInitialLoading = showResults && isLoading && songs.length === 0;
  const showRefreshing = showResults && isFetching && songs.length > 0;
  const prefetchSongOptions = useCallback(
    (songId: string) => {
      if (!serviceTypeId) return;
      void queryClient.prefetchQuery(
        createSongOptionsQueryOptions(songId, serviceTypeId)
      );
    },
    [queryClient, serviceTypeId]
  );

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        desktopClassName="max-w-2xl"
        mobileClassName="max-h-[90svh]"
      >
        <ResponsiveDialogHeader className="px-4 pt-3 text-left sm:px-0 sm:pt-0">
          <ResponsiveDialogTitle>Add Song</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <Command
          shouldFilter={false}
          className="rounded-none border-x-0 border-b-0 sm:rounded-lg sm:border"
        >
          <CommandInput
            placeholder="Search songs, writers, or themes..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[420px]">
            {!showResults ? (
              <div className="text-muted-foreground flex min-h-[240px] flex-col items-center justify-center gap-2 px-6 py-10 text-center text-sm">
                <Search className="size-8 opacity-50" />
                <p>Start typing to search the song catalog.</p>
              </div>
            ) : showInitialLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <>
                <CommandEmpty>No songs matched that search.</CommandEmpty>
                {showRefreshing ? (
                  <div
                    className="text-muted-foreground border-b px-3 py-2 text-xs"
                    aria-live="polite"
                  >
                    Searching…
                  </div>
                ) : null}
                <div className="space-y-2 p-3">
                  {songs.map((song) => {
                    const lastScheduledLabel = formatLastScheduled(
                      song.lastScheduledAt
                    );

                    return (
                      <CommandItem
                        key={song.id}
                        value={[song.title, song.author, song.themes]
                          .filter(Boolean)
                          .join(" ")}
                        disabled={pendingSongId === song.id}
                        className="items-start"
                        onMouseEnter={() => prefetchSongOptions(song.id)}
                        onFocus={() => prefetchSongOptions(song.id)}
                        onTouchStart={() => prefetchSongOptions(song.id)}
                        onSelect={async () => {
                          await onSelectSong(song);
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {song.title}
                          </p>
                          {song.author ? (
                            <p className="text-muted-foreground truncate text-xs">
                              {song.author}
                            </p>
                          ) : null}
                          {lastScheduledLabel ? (
                            <p className="text-muted-foreground mt-2 text-xs">
                              Last scheduled {lastScheduledLabel}
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            {song.themes
                              .split(",")
                              .map((theme) => theme.trim())
                              .filter(Boolean)
                              .slice(0, 3)
                              .map((theme) => (
                                <Badge key={theme} variant="outline">
                                  {theme}
                                </Badge>
                              ))}
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </div>
              </>
            )}
          </CommandList>
        </Command>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
