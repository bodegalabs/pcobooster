import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { LoadingBar } from "@/components/ui/loading-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { createChordChartSongQueryOptions } from "@/hooks/use-chord-chart-song";
import { useIntentPrefetch } from "@/hooks/use-intent-prefetch";
import { useOrganizationTimeZone } from "@/hooks/use-organization-timezone";
import { useSongSearch } from "@/hooks/use-song-search";
import { isQueryFresh } from "@/lib/intent-prefetch";
import { formatSongLastScheduled } from "@/lib/song-catalog-client";

export const SongsPageSkeleton = () => (
  <main className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4" aria-busy>
    <Skeleton variant="control" className="h-10 w-full" />
    {Array.from({ length: 6 }, (_, row) => `row-${row}`).map((row) => (
      <Skeleton key={row} variant="control" className="h-14 w-full" />
    ))}
  </main>
);

/** Finds a song in the Planning Center library to write its chord chart. */
export const SongsPage = () => {
  const queryClient = useQueryClient();
  const orgTimeZone = useOrganizationTimeZone();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const {
    data: songs = [],
    isLoading,
    isFetching,
    isError,
  } = useSongSearch(deferredQuery);
  const searching = deferredQuery.trim().length > 0;
  const { getIntentProps } = useIntentPrefetch<string>({
    keyOf: (songId) => songId,
    isFresh: (songId) => {
      const options = createChordChartSongQueryOptions(songId);
      return isQueryFresh(queryClient, options.queryKey, options.staleTime);
    },
    prefetch: async (songId) => {
      await queryClient.query(createChordChartSongQueryOptions(songId));
    },
  });

  return (
    <main className="bg-background flex flex-1 flex-col md:min-h-0 md:overflow-y-auto">
      <div className="pb-safe-4 mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pt-1 md:py-4">
        <header className="max-md:sr-only">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            Songs
          </h1>
          <p className="text-muted-foreground text-sm">
            Write and preview chord charts, then save them to Planning Center.
          </p>
        </header>
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="Search songs, writers, or themes"
            aria-label="Search songs"
          />
        </InputGroup>
        <LoadingBar active={searching && isFetching && songs.length > 0} />
        {searching ? null : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Find a song</EmptyTitle>
              <EmptyDescription>
                Search your Planning Center library to open its chord chart.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {searching && isLoading && songs.length === 0 ? (
          <SongsPageSkeleton />
        ) : null}
        {searching && isError ? (
          <p className="text-muted-foreground text-sm">
            Song search failed. Try again.
          </p>
        ) : null}
        {searching && !isLoading && !isError && songs.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No songs matched that search.
          </p>
        ) : null}
        {searching && songs.length > 0 ? (
          <ul className="divide-border/60 flex flex-col divide-y">
            {songs.map((song) => {
              const lastScheduled = formatSongLastScheduled(
                song.lastScheduledAt,
                orgTimeZone
              );
              return (
                <li key={song.id}>
                  <Link
                    to="/songs/$songId"
                    params={{ songId: song.id }}
                    className="hover:bg-muted/60 focus-visible:bg-muted/60 -mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 outline-none"
                    {...getIntentProps(song.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {song.title}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {[song.author, lastScheduled]
                          .filter((part) => part !== null && part !== "")
                          .join(" · ")}
                      </p>
                    </div>
                    <ChevronRight
                      className="text-muted-foreground size-4 shrink-0"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </main>
  );
};
