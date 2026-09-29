import { normalizeSongCatalogEntry } from "@pcobooster/api/modules/planning-center/plan-items-shared";
import type { SongCatalogReader } from "@pcobooster/api/modules/planning-center/search-songs";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type {
  PCResource,
  SongCatalogEntry,
} from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

/**
 * Enough recent songs to reach past the last few weeks, which the library shows as just
 * sung, to what other services sang a month or two ago.
 */
const RECENT_LIMIT = 100;
const RESTING_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Songs not played for this long are resting: known to the team, not worn out. */
export const RESTING_AFTER_DAYS = 90;

export interface SongSuggestions {
  /** Played most recently first, up to now. */
  recentlyPlayed: SongCatalogEntry[];
  /** Played before, but not within the resting window; most recently rested first. */
  resting: SongCatalogEntry[];
}

const byLastScheduledDescending = (a: SongCatalogEntry, b: SongCatalogEntry) =>
  (b.lastScheduledAt?.getTime() ?? 0) - (a.lastScheduledAt?.getTime() ?? 0);

/** Splits the visible catalog into what the church sings now and what it has set aside. */
export const suggestFromCatalog = (
  catalog: readonly PCResource[],
  now: Date
): SongSuggestions => {
  const restingBefore = now.getTime() - RESTING_AFTER_DAYS * DAY_MS;
  const played: SongCatalogEntry[] = [];
  for (const rawSong of catalog) {
    const song = normalizeSongCatalogEntry(rawSong);
    const playedAt = song.lastScheduledAt?.getTime() ?? null;
    if (song.hidden || playedAt === null || playedAt > now.getTime()) {
      continue;
    }
    played.push(song);
  }
  played.sort(byLastScheduledDescending);

  return {
    recentlyPlayed: played
      .filter((song) => (song.lastScheduledAt?.getTime() ?? 0) >= restingBefore)
      .slice(0, RECENT_LIMIT),
    resting: played
      .filter((song) => (song.lastScheduledAt?.getTime() ?? 0) < restingBefore)
      .slice(0, RESTING_LIMIT),
  };
};

/** Reads the cached catalog, so suggestions cost no Planning Center request when it is warm. */
export const suggestSongs = (
  cacheKey: string,
  songCatalogReader: SongCatalogReader,
  now: Date
): Effect.Effect<SongSuggestions, PlanningCenterError> =>
  Effect.map(songCatalogReader.getSongsCatalogCached(cacheKey), (catalog) =>
    suggestFromCatalog(catalog, now)
  );
