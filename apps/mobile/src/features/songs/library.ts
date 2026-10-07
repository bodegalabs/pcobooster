import type { songLibraryEntrySchema } from "@pcobooster/contracts/http/songs";
import { formatCalendarDateLabel } from "@pcobooster/planning-center-models/calendar";
import { scoreSongSearch } from "@pcobooster/planning-center-models/song-search";

/**
 * The Songs tab's library rules, ported from the web's `songs-index.ts` and the Swift
 * `SongLibraryModel`: which songs a view lists, in what order, under which headings, and the
 * one-line summary above them. Facts only; nothing here ranks songs to recommend them.
 */
export type SongLibraryEntry = typeof songLibraryEntrySchema.Type;

/** Which songs the library lists; the `unused` filters reach back whole calendar months. */
export const songLibraryFilters = [
  { value: "all", label: "All songs" },
  { value: "unused-6", label: "Unused 6+ months", months: 6 },
  { value: "unused-12", label: "Unused 1+ year", months: 12 },
  { value: "unused-24", label: "Unused 2+ years", months: 24 },
  { value: "never", label: "Never scheduled" },
] as const;

export type SongLibraryFilter = (typeof songLibraryFilters)[number]["value"];

export const songLibrarySorts = [
  { value: "recent", label: "Recently used" },
  { value: "title", label: "Title" },
  { value: "longest", label: "Longest unused" },
] as const;

export type SongLibrarySort = (typeof songLibrarySorts)[number]["value"];

export const DEFAULT_SONG_LIBRARY_FILTER: SongLibraryFilter = "all";
export const DEFAULT_SONG_LIBRARY_SORT: SongLibrarySort = "recent";

export const parseSongLibraryFilter = (
  value: string | null | undefined
): SongLibraryFilter =>
  songLibraryFilters.find((filter) => filter.value === value)?.value ??
  DEFAULT_SONG_LIBRARY_FILTER;

export const parseSongLibrarySort = (
  value: string | null | undefined
): SongLibrarySort =>
  songLibrarySorts.find((sort) => sort.value === value)?.value ??
  DEFAULT_SONG_LIBRARY_SORT;

export const songLibraryFilterLabel = (filter: SongLibraryFilter): string =>
  songLibraryFilters.find((option) => option.value === filter)?.label ?? "";

/** `now` moved back `months` calendar months in UTC, clamped to the target month's last day. */
export const monthsBefore = (now: Date, months: number): Date => {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() - months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(now.getUTCDate(), lastDay),
      now.getUTCHours(),
      now.getUTCMinutes()
    )
  );
};

/** The instant an `unused` filter looks back to; null for the other filters. */
export const songLibraryCutoff = (
  filter: SongLibraryFilter,
  now: Date
): Date | null => {
  const match = songLibraryFilters.find((option) => option.value === filter);
  return match !== undefined && "months" in match
    ? monthsBefore(now, match.months)
    : null;
};

/**
 * Not on any plan since `cutoff`. A never-scheduled song counts only once it is older than the
 * cutoff, so songs added recently aren't listed for hiding.
 */
const isUnusedSince = (song: SongLibraryEntry, cutoff: Date) => {
  const lastUsed = song.lastScheduledAt ?? song.createdAt;
  return lastUsed === null || lastUsed < cutoff;
};

const byTitle = (a: SongLibraryEntry, b: SongLibraryEntry) =>
  a.title.localeCompare(b.title);

const timeOf = (date: Date | null, missing: number) =>
  date === null ? missing : date.getTime();

const compareSongs: Record<
  SongLibrarySort,
  (a: SongLibraryEntry, b: SongLibraryEntry) => number
> = {
  // Latest plan first (Planning Center counts upcoming plans); never-scheduled songs last.
  recent: (a, b) =>
    timeOf(b.lastScheduledAt, Number.NEGATIVE_INFINITY) -
      timeOf(a.lastScheduledAt, Number.NEGATIVE_INFINITY) || byTitle(a, b),
  title: byTitle,
  // Never-scheduled songs first, oldest added first, then the longest since used.
  longest: (a, b) => {
    const aNever = a.lastScheduledAt === null;
    const bNever = b.lastScheduledAt === null;
    if (aNever !== bNever) {
      return aNever ? -1 : 1;
    }
    const aTime = aNever
      ? timeOf(a.createdAt, Number.NEGATIVE_INFINITY)
      : timeOf(a.lastScheduledAt, 0);
    const bTime = bNever
      ? timeOf(b.createdAt, Number.NEGATIVE_INFINITY)
      : timeOf(b.lastScheduledAt, 0);
    return aTime - bTime || byTitle(a, b);
  },
};

export interface SongLibraryView {
  readonly filter: SongLibraryFilter;
  readonly sort: SongLibrarySort;
  /** A search ranks matches by relevance instead of `sort`. */
  readonly query: string;
}

/** The songs a library view lists, in the order it lists them (the web's `selectSongLibrary`). */
export const selectSongLibrary = (
  songs: readonly SongLibraryEntry[],
  { filter, sort, query }: SongLibraryView,
  now: Date
): SongLibraryEntry[] => {
  const cutoff = songLibraryCutoff(filter, now);
  const listed = songs.filter((song) => {
    if (filter === "never") {
      return song.lastScheduledAt === null;
    }
    return cutoff === null || isUnusedSince(song, cutoff);
  });
  const trimmed = query.trim();
  if (trimmed === "") {
    return listed.toSorted(compareSongs[sort]);
  }
  return listed
    .flatMap((song) => {
      const score = scoreSongSearch(song, trimmed, now);
      return score > 0 ? [{ song, score }] : [];
    })
    .toSorted((a, b) => b.score - a.score || byTitle(a.song, b.song))
    .map(({ song }) => song);
};

/** The song's display title, with the web's fallback for an untitled song. */
export const songDisplayTitle = (title: string): string => {
  const trimmed = title.trim();
  return trimmed === "" ? "Untitled song" : trimmed;
};

/** One library row: a library song, or a recently opened one the library doesn't have yet. */
export interface SongRowData {
  readonly id: string;
  readonly title: string;
  readonly author: string;
  readonly themes: string;
  /** The latest plan with the song, upcoming ones included; null when never on one. */
  readonly lastScheduledAt: Date | null;
  readonly createdAt: Date | null;
  /** Songs from this device's recent list that the library lacks carry no dates. */
  readonly dated: boolean;
}

export const libraryRow = (song: SongLibraryEntry): SongRowData => ({
  id: song.id,
  title: songDisplayTitle(song.title),
  author: song.author,
  themes: song.themes,
  lastScheduledAt: song.lastScheduledAt,
  createdAt: song.createdAt,
  dated: true,
});

export interface RecentSong {
  readonly id: string;
  readonly title: string;
  readonly author: string;
}

export const recentRow = (song: RecentSong): SongRowData => ({
  id: song.id,
  title: songDisplayTitle(song.title),
  author: song.author,
  themes: "",
  lastScheduledAt: null,
  createdAt: null,
  dated: false,
});

/** Dated, but never on a plan. */
export const neverScheduled = (row: SongRowData): boolean =>
  row.dated && row.lastScheduledAt === null;

/** Recent songs whose title or writers contain every word of the query (`matchRecentSongs`). */
export const matchRecentSongs = (
  songs: readonly RecentSong[],
  query: string
): RecentSong[] => {
  const words = query
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => word !== "");
  return songs.filter((song) => {
    const haystack = `${song.title} ${song.author}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
};

/** How many recently opened songs the library shows above the list (`RECENT_SHOWN`). */
export const RECENT_SHOWN = 4;

/** A run of rows under one heading: a letter when sorted by title, else one section. */
export interface SongLibrarySection {
  readonly id: string;
  /** The letter heading (title sort only). */
  readonly letter: string | null;
  readonly rows: readonly SongRowData[];
}

const LETTER = /^[A-Z]$/u;
const COMBINING_MARKS = /\p{Mn}/gu;

/** The section letter for a title: its first letter without accents, or "#". */
export const indexLetter = (title: string): string => {
  const code = title.codePointAt(0);
  if (code === undefined) {
    return "#";
  }
  const folded = String.fromCodePoint(code)
    .normalize("NFD")
    .replaceAll(COMBINING_MARKS, "")
    .toUpperCase();
  return LETTER.test(folded) ? folded : "#";
};

export interface SongLibraryListing {
  readonly recent: readonly SongRowData[];
  readonly sections: readonly SongLibrarySection[];
  /** The library songs the view lists, before recents join a search. */
  readonly listedCount: number;
}

/**
 * What the library lists: up to four recently opened songs (All songs, no search), then the
 * listed songs, by letter when sorted by title. A search also finds songs opened on this device
 * that the hour-cached library doesn't have yet, ahead of its matches.
 */
export const songLibraryListing = ({
  songs,
  recents,
  view,
  now,
}: {
  songs: readonly SongLibraryEntry[];
  recents: readonly RecentSong[];
  view: SongLibraryView;
  now: Date;
}): SongLibraryListing => {
  const listed = selectSongLibrary(songs, view, now);
  const searching = view.query.trim() !== "";
  const byId = new Map(songs.map((song) => [song.id, song]));
  let rows = listed.map(libraryRow);
  if (searching && view.filter === "all") {
    const justAdded = matchRecentSongs(recents, view.query.trim()).flatMap(
      (recent) => (byId.has(recent.id) ? [] : [recentRow(recent)])
    );
    rows = [...justAdded, ...rows];
  }
  const recent =
    searching || view.filter !== "all"
      ? []
      : recents.slice(0, RECENT_SHOWN).map((song) => {
          const entry = byId.get(song.id);
          return entry === undefined ? recentRow(song) : libraryRow(entry);
        });
  if (view.sort !== "title" || searching) {
    return {
      recent,
      sections: rows.length === 0 ? [] : [{ id: "songs", letter: null, rows }],
      listedCount: listed.length,
    };
  }
  const sections: SongLibrarySection[] = [];
  for (const row of rows) {
    const letter = indexLetter(row.title);
    const last = sections.at(-1);
    if (last?.letter === letter) {
      sections[sections.length - 1] = { ...last, rows: [...last.rows, row] };
    } else {
      sections.push({ id: letter, letter, rows: [row] });
    }
  }
  return { recent, sections, listedCount: listed.length };
};

/** "1 song" or "1,234 songs". */
export const songCount = (count: number): string =>
  count === 1 ? "1 song" : `${count.toLocaleString("en-US")} songs`;

/**
 * "34 songs", or what a tidy-up filter found (the web's `describeView`). Null while searching.
 * The cutoff date is labeled in the organization's zone.
 */
export const songLibrarySummary = ({
  songs,
  view,
  now,
  timeZone,
}: {
  songs: readonly SongLibraryEntry[];
  view: SongLibraryView;
  now: Date;
  timeZone: string;
}): string | null => {
  if (view.query.trim() !== "") {
    return null;
  }
  const listed = selectSongLibrary(songs, view, now);
  if (view.filter === "never") {
    const verb = listed.length === 1 ? "has" : "have";
    return `${songCount(listed.length)} ${verb} never been scheduled.`;
  }
  const cutoff = songLibraryCutoff(view.filter, now);
  if (cutoff === null) {
    return songCount(songs.length);
  }
  const never = listed.filter((song) => song.lastScheduledAt === null).length;
  const including =
    never > 0
      ? `, including ${never.toLocaleString("en-US")} never scheduled`
      : "";
  const since = formatCalendarDateLabel(cutoff, timeZone, "monthDayYear");
  return `${listed.length.toLocaleString("en-US")} of ${songCount(songs.length)} not used since ${since}${including}.`;
};
