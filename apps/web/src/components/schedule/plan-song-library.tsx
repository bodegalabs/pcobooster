import { useDndMonitor, useDraggable } from "@dnd-kit/core";
import type { SongCatalogEntry } from "@pcobooster/planning-center-models/types";
import { useDeferredValue, useState } from "react";
import type { RefObject } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { useSongSearch } from "@/hooks/use-song-search";
import { useSongSuggestions } from "@/hooks/use-song-suggestions";
import { formatPlayedAgo } from "@/lib/plan-set-insights";

/** Drag ids for library songs, kept apart from plan item ids in the shared drag context. */
export const LIBRARY_SONG_DRAG_PREFIX = "library-song:";

interface LibrarySongItemProps {
  song: SongCatalogEntry;
  inPlan: boolean;
  pending: boolean;
  now: Date;
  onAdd: (song: SongCatalogEntry) => void;
}

const LibrarySongItem = ({
  song,
  inPlan,
  pending,
  now,
  onAdd,
}: LibrarySongItemProps) => {
  const { setNodeRef, listeners } = useDraggable({
    id: `${LIBRARY_SONG_DRAG_PREFIX}${song.id}`,
  });
  let status: string | null = null;
  if (inPlan) {
    status = "In plan";
  } else if (song.lastScheduledAt !== null) {
    status = formatPlayedAgo(song.lastScheduledAt, now);
  }

  return (
    <CommandItem
      ref={setNodeRef}
      value={song.id}
      disabled={pending}
      onSelect={() => {
        onAdd(song);
      }}
      {...listeners}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{song.title}</span>
        {song.author ? (
          <span className="text-muted-foreground truncate text-xs font-normal">
            {song.author}
          </span>
        ) : null}
      </span>
      {status === null ? null : (
        <span className="text-muted-foreground shrink-0 text-xs font-normal tabular-nums">
          {status}
        </span>
      )}
    </CommandItem>
  );
};

const LibrarySkeleton = () => (
  <div className="flex flex-col gap-3 p-3" aria-busy aria-label="Loading songs">
    {["10rem", "7rem", "9rem", "8rem", "11rem"].map((width) => (
      <div key={width} className="flex flex-col gap-1.5">
        <Skeleton variant="text" className="h-3.5" width={width} />
        <Skeleton variant="text" className="h-3 w-20" />
      </div>
    ))}
  </div>
);

interface PlanSongLibraryProps {
  searchInputRef: RefObject<HTMLInputElement | null>;
  planSongIds: ReadonlySet<string>;
  /** Where Enter or a click puts a song, e.g. `after “Egypt”`. */
  insertionLabel: string;
  pendingSongId: string | null;
  onAddSong: (song: SongCatalogEntry) => void;
  /** A library song started dragging toward the run sheet. */
  onSongDragStart: (song: SongCatalogEntry) => void;
  /** Escape hands the keyboard back to the run sheet. */
  onLeave: () => void;
}

/**
 * The builder's song source: search the catalog, or pick from what the church has sung
 * lately and what has rested. Enter or a click adds a song at the insertion point; songs
 * can also be dragged into the run sheet.
 */
export const PlanSongLibrary = ({
  searchInputRef,
  planSongIds,
  insertionLabel,
  pendingSongId,
  onAddSong,
  onSongDragStart,
  onLeave,
}: PlanSongLibraryProps) => {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const searching = deferredQuery.trim().length > 0;
  const search = useSongSearch(deferredQuery);
  const suggestions = useSongSuggestions();
  const now = new Date();
  const visibleSongs = searching
    ? (search.data ?? [])
    : [
        ...(suggestions.data?.recentlyPlayed ?? []),
        ...(suggestions.data?.resting ?? []),
      ];
  useDndMonitor({
    onDragStart: (event) => {
      const dragId = String(event.active.id);
      if (!dragId.startsWith(LIBRARY_SONG_DRAG_PREFIX)) {
        return;
      }
      const songId = dragId.slice(LIBRARY_SONG_DRAG_PREFIX.length);
      const song = visibleSongs.find((candidate) => candidate.id === songId);
      if (song !== undefined) {
        onSongDragStart(song);
      }
    },
  });

  const renderSongs = (songs: readonly SongCatalogEntry[]) =>
    songs.map((song) => (
      <LibrarySongItem
        key={song.id}
        song={song}
        inPlan={planSongIds.has(song.id)}
        pending={pendingSongId === song.id}
        now={now}
        onAdd={onAddSong}
      />
    ));

  let content: React.ReactNode;
  if (searching) {
    content =
      search.isLoading && search.data === undefined ? (
        <LibrarySkeleton />
      ) : (
        <>
          <CommandEmpty>No songs match.</CommandEmpty>
          <CommandGroup>{renderSongs(search.data ?? [])}</CommandGroup>
        </>
      );
  } else if (suggestions.data === undefined) {
    content = suggestions.isError ? (
      <p className="text-muted-foreground p-3 text-sm">
        Suggestions didn&apos;t load. Search to find songs.
      </p>
    ) : (
      <LibrarySkeleton />
    );
  } else {
    content = (
      <>
        <CommandGroup heading="Recently played">
          {renderSongs(suggestions.data.recentlyPlayed)}
        </CommandGroup>
        <CommandGroup heading="Resting">
          {renderSongs(suggestions.data.resting)}
        </CommandGroup>
      </>
    );
  }

  return (
    <Command
      shouldFilter={false}
      label="Song library"
      className="min-h-0 flex-1"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onLeave();
        }
      }}
    >
      <CommandInput
        ref={searchInputRef}
        value={query}
        onValueChange={setQuery}
        placeholder="Search songs"
      />
      <p className="text-muted-foreground flex items-center gap-1.5 px-3 pt-2 text-xs">
        <Kbd>↵</Kbd>
        <span className="truncate">adds {insertionLabel}</span>
      </p>
      <CommandList className="max-h-none min-h-0 flex-1">{content}</CommandList>
    </Command>
  );
};
