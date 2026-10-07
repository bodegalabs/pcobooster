import { Forbidden } from "@pcobooster/contracts/faults/forbidden";
import { NotFound } from "@pcobooster/contracts/faults/not-found";
import type { chordChartArrangementSchema } from "@pcobooster/contracts/http/chord-charts";
import type {
  arrangementOptionSchema,
  keyOptionSchema,
} from "@pcobooster/contracts/http/song-schemas";
import type { songHistoryEntrySchema } from "@pcobooster/contracts/http/songs";
import {
  formatCalendarDateLabel,
  formatCalendarDayInTimeZone,
} from "@pcobooster/planning-center-models/calendar";
import {
  formatCompactAgo,
  songHistoryCountLabel,
  summarizeSongHistory,
  tempoLabel,
} from "@pcobooster/planning-center-models/song-library";

import { displayKey } from "../../lib/song-keys";

/**
 * One song's facts, ported from the Swift `SongDetailModel` and its sections: when it was last
 * and next sung, how often and where, its keys, and its arrangements. Facts only: nothing here
 * ranks, suggests, or judges a song.
 */
export type SongHistoryEntry = typeof songHistoryEntrySchema.Type;
export type ArrangementOption = typeof arrangementOptionSchema.Type;
export type ChordChartArrangement = typeof chordChartArrangementSchema.Type;
export type KeyOption = typeof keyOptionSchema.Type;

/** Active arrangements first, then archived ones, each in the order Planning Center sent. */
export const activeFirst = <Arrangement extends { readonly archived: boolean }>(
  arrangements: readonly Arrangement[]
): Arrangement[] => [
  ...arrangements.filter((arrangement) => !arrangement.archived),
  ...arrangements.filter((arrangement) => arrangement.archived),
];

export interface SongHistorySplit {
  /** Plans after now that already have the song, soonest first. */
  readonly upcoming: readonly SongHistoryEntry[];
  /** Plans at or before now, newest first. */
  readonly past: readonly SongHistoryEntry[];
}

/** `songs.history` is newest first; splits it at `now`. */
export const splitSongHistory = (
  history: readonly SongHistoryEntry[],
  now: Date
): SongHistorySplit => ({
  upcoming: history.filter((entry) => entry.sortDate > now).toReversed(),
  past: history.filter((entry) => entry.sortDate <= now),
});

export const serviceTypeLabel = (name: string): string =>
  name === "" ? "Unknown service" : name;

export interface ServiceTypeCount {
  readonly name: string;
  readonly count: number;
}

/** How the past year splits across service types, most first: "10 at Sunday Gathering". */
export const serviceTypeCounts = (
  past: readonly SongHistoryEntry[]
): ServiceTypeCount[] => {
  const counts = new Map<string, number>();
  for (const entry of past) {
    const name = serviceTypeLabel(entry.serviceTypeName);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .toSorted((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

/** More than one arrangement shows up in the history, so its rows name theirs. */
export const historyNamesArrangements = (
  history: readonly SongHistoryEntry[]
): boolean =>
  new Set(
    history.flatMap((entry) =>
      entry.arrangementName === null ? [] : [entry.arrangementName]
    )
  ).size > 1;

/** The arrangement (when the history spans several) and a named key ("Jordan's key"). */
export const historyRowDetail = (
  entry: SongHistoryEntry,
  namesArrangement: boolean
): string | null => {
  const parts: string[] = [];
  const { arrangementName, keyName } = entry;
  if (namesArrangement && arrangementName !== null && arrangementName !== "") {
    parts.push(arrangementName);
  }
  if (
    keyName !== null &&
    keyName !== "" &&
    keyName !== "Original" &&
    keyName !== entry.startingKey
  ) {
    parts.push(keyName);
  }
  return parts.length === 0 ? null : parts.join(" · ");
};

const sameOrgYear = (a: Date, b: Date, timeZone: string): boolean =>
  formatCalendarDayInTimeZone(a, timeZone).slice(0, 4) ===
  formatCalendarDayInTimeZone(b, timeZone).slice(0, 4);

/** "Sep 27" this year, "Mar 10, 2024" before or after it, in the org's calendar. */
export const compactDate = (date: Date, now: Date, timeZone: string): string =>
  formatCalendarDateLabel(
    date,
    timeZone,
    sameOrgYear(date, now, timeZone) ? "monthDay" : "monthDayYear"
  );

/** "Sun, Oct 4" this year, "Nov 9, 2025" in another, for history rows. */
export const historyDateLabel = (
  date: Date,
  now: Date,
  timeZone: string
): string =>
  formatCalendarDateLabel(
    date,
    timeZone,
    sameOrgYear(date, now, timeZone) ? "weekdayMonthDay" : "monthDayYear"
  );

/** One fact on the song's summary card. */
export type SongFact =
  | {
      readonly kind: "value";
      readonly label: string;
      readonly value: string;
      readonly caption: string | null;
      readonly accessibilityValue: string;
    }
  | { readonly kind: "keys"; readonly label: string; readonly keys: string[] };

/**
 * Last sung, next planned, how often in the past year (and where), and the keys it was sung in,
 * counted from `now`.
 */
export const songFacts = (
  history: readonly SongHistoryEntry[],
  now: Date,
  timeZone: string
): SongFact[] => {
  const summary = summarizeSongHistory(history, now, null);
  const { upcoming, past } = splitSongHistory(history, now);
  const counts = serviceTypeCounts(past);
  const { last } = summary;
  const lastSung: SongFact =
    last === null
      ? {
          kind: "value",
          label: "Last sung",
          value: "Not in the past year",
          caption: null,
          accessibilityValue: "Not in the past year",
        }
      : {
          kind: "value",
          label: "Last sung",
          value: compactDate(last.sortDate, now, timeZone),
          caption: `${formatCompactAgo(last.sortDate, now)} ago`,
          accessibilityValue: formatCalendarDateLabel(
            last.sortDate,
            timeZone,
            "weekdayMonthDayYear"
          ),
        };
  const [next] = upcoming;
  const nextPlanned: SongFact =
    next === undefined
      ? {
          kind: "value",
          label: "Next planned",
          value: "Not planned",
          caption: null,
          accessibilityValue: "Not planned",
        }
      : {
          kind: "value",
          label: "Next planned",
          value: compactDate(next.sortDate, now, timeZone),
          caption: next.serviceTypeName === "" ? null : next.serviceTypeName,
          accessibilityValue: formatCalendarDateLabel(
            next.sortDate,
            timeZone,
            "weekdayMonthDayYear"
          ),
        };
  const times =
    summary.timesThisYear === 1 ? "Once" : `${summary.timesThisYear} times`;
  const caption =
    counts.length > 1
      ? counts
          .slice(0, 2)
          .map(({ name, count }) => `${count} at ${name}`)
          .join(", ")
      : (counts[0]?.name ?? null);
  const facts: SongFact[] = [
    lastSung,
    nextPlanned,
    {
      kind: "value",
      label: "Past year",
      value: times,
      caption,
      accessibilityValue: times,
    },
    { kind: "keys", label: "Keys", keys: summary.keys },
  ];
  return facts;
};

/** "Sung 12 times in the past year · 10 at Sunday Gathering, 2 at Youth Night". */
export const historyCountLine = (
  history: readonly SongHistoryEntry[],
  now: Date
): string => {
  const summary = summarizeSongHistory(history, now, null);
  const label = songHistoryCountLabel(summary, null);
  const counts = serviceTypeCounts(splitSongHistory(history, now).past);
  if (counts.length === 0) {
    return label;
  }
  if (counts.length === 1) {
    return `${label} · ${counts[0]?.name ?? ""}`;
  }
  return `${label} · ${counts.map(({ name, count }) => `${count} at ${name}`).join(", ")}`;
};

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

/** "5:00", "1:02:03": an arrangement's length. */
export const formatLength = (seconds: number): string | null => {
  const total = Math.round(seconds);
  if (!Number.isFinite(total) || total <= 0) {
    return null;
  }
  const hours = Math.floor(total / SECONDS_PER_HOUR);
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const rest = String(total % SECONDS_PER_MINUTE).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
};

/** What an arrangement row shows, from `songs.options` or, until it loads, the chart read. */
export interface ArrangementRowData {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
  readonly keys: readonly KeyOption[];
  /** "74 bpm · 4/4 · 5:00", or null when Planning Center sets none of them. */
  readonly facts: string | null;
  readonly sequence: readonly string[];
}

export const arrangementRows = (
  options?: readonly ArrangementOption[],
  charts?: readonly ChordChartArrangement[]
): ArrangementRowData[] => {
  if (options !== undefined && options.length > 0) {
    return activeFirst(options).map((option) => {
      const length =
        option.length === null ? null : formatLength(option.length);
      const parts = [tempoLabel(option), length].filter(
        (part): part is string => part !== null && part !== ""
      );
      return {
        id: option.id,
        name: option.name === "" ? "Untitled arrangement" : option.name,
        archived: option.archived,
        keys: option.keys,
        facts: parts.length === 0 ? null : parts.join(" · "),
        sequence: option.sequence,
      };
    });
  }
  return activeFirst(charts ?? []).map((chart) => ({
    id: chart.id,
    name: chart.name === "" ? "Untitled arrangement" : chart.name,
    archived: chart.archived,
    keys: chart.keys,
    facts: null,
    sequence: [],
  }));
};

/** "G", or "Jordan's key (A)" when the key has its own name. */
export const keyOptionLabel = (key: KeyOption): string => {
  const name = key.name.trim();
  const start = key.startingKey ?? "";
  if (name === "" || name === start) {
    return start === "" ? "No key" : displayKey(start);
  }
  return start === "" ? name : `${name} (${displayKey(start)})`;
};

/**
 * Picks the service type `songs.options` is read under. The arrangements it returns are the
 * same for every service type; the latest one the song was sung at, else the organization's
 * first, keeps the read on a service type the person can see.
 */
export const optionsServiceTypeId = (
  history: readonly SongHistoryEntry[] | undefined,
  serviceTypes: readonly { readonly id: string }[] | undefined
): string | null =>
  history?.find((entry) => entry.serviceTypeId !== null)?.serviceTypeId ??
  serviceTypes?.[0]?.id ??
  null;

/** Why a song didn't open, so the screen can say what would help (`chordChartLoadFailure`). */
export type SongLoadFailure =
  | { readonly kind: "not-found" }
  | { readonly kind: "no-access"; readonly message: string }
  | { readonly kind: "failed" };

export const songLoadFailure = (error: Error | null): SongLoadFailure => {
  if (error instanceof NotFound) {
    return { kind: "not-found" };
  }
  if (error instanceof Forbidden) {
    return {
      kind: "no-access",
      message:
        error.message === ""
          ? "Your Planning Center account can’t view songs in Services."
          : error.message,
    };
  }
  return { kind: "failed" };
};

export interface SongLoadFailureCopy {
  readonly title: string;
  readonly message: string;
  readonly canRetry: boolean;
}

export const songLoadFailureCopy = (
  failure: SongLoadFailure
): SongLoadFailureCopy => {
  if (failure.kind === "not-found") {
    return {
      title: "Song not found",
      message:
        "Planning Center has no song at this link. It may have been deleted, or it belongs to another organization.",
      canRetry: false,
    };
  }
  if (failure.kind === "no-access") {
    return {
      title: "You can’t open this song",
      message: failure.message,
      canRetry: false,
    };
  }
  return {
    title: "This song didn’t load",
    message: "Planning Center didn’t answer. Try again in a moment.",
    canRetry: true,
  };
};

interface ReadState {
  readonly status: "pending" | "error" | "success";
  readonly error: Error | null;
}

/**
 * The whole screen shows a failure only when nothing names the song and every read it started
 * failed; otherwise each section shows its own state. The chart read's fault is the most
 * specific, then options, then history.
 */
export const songScreenFailure = ({
  titleKnown,
  history,
  options,
  chart,
}: {
  titleKnown: boolean;
  history: ReadState;
  options: ReadState | null;
  chart: ReadState | null;
}): SongLoadFailure | null => {
  if (titleKnown) {
    return null;
  }
  const started = [history, options, chart].filter(
    (read): read is ReadState => read !== null
  );
  if (!started.every((read) => read.status === "error")) {
    return null;
  }
  return songLoadFailure(chart?.error ?? options?.error ?? history.error);
};

/** Planning Center Services pages, where hiding, deleting, and attachments live. */
export const planningCenterSongUrl = (songId: string): string =>
  `https://services.planningcenteronline.com/songs/${encodeURIComponent(songId)}`;

export const planningCenterArrangementUrl = (
  songId: string,
  arrangementId: string
): string =>
  `${planningCenterSongUrl(songId)}/arrangements/${encodeURIComponent(arrangementId)}`;
