import {
  normalizeSongCatalogEntry,
  scoreSongSearch,
} from "@pcobooster/api/modules/planning-center/plan-items-shared";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterSongsService } from "@pcobooster/api/planning-center/services/songs-service";
import type {
  PCResource,
  SongCatalogEntry,
} from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

const MAX_RESULTS = 24;
const SONG_SEARCH_RESULT_CACHE_TTL_MS = 5 * 60 * 1000;

interface SongSearchResultCacheEntry {
  expiresAt: number;
  songs: SongCatalogEntry[];
}

const songSearchResultCache = new Map<string, SongSearchResultCacheEntry>();

export interface SongCatalogReader {
  getSongsCatalogCached: PlanningCenterSongsService["getSongsCatalogCached"];
}

const rankSongs = (
  catalog: PCResource[],
  normalizedQuery: string
): SongCatalogEntry[] => {
  const normalized: SongCatalogEntry[] = [];
  for (const rawSong of catalog) {
    const song = normalizeSongCatalogEntry(rawSong);
    if (song.hidden) {
      continue;
    }
    const matchScore = scoreSongSearch(song, normalizedQuery);
    if (matchScore > 0) {
      normalized.push({ ...song, matchScore });
    }
  }
  normalized.sort((a, b) => {
    const scoreDiff = (b.matchScore ?? 0) - (a.matchScore ?? 0);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return a.title.localeCompare(b.title);
  });
  return normalized.slice(0, MAX_RESULTS);
};

/**
 * The song catalog belongs to the organization, not a service type, so one cached catalog
 * per credential serves every service type's search.
 */
export const searchSongs = (
  cacheKey: string,
  query: string,
  songCatalogReader: SongCatalogReader
): Effect.Effect<SongCatalogEntry[], PlanningCenterError> =>
  Effect.suspend(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return Effect.succeed([]);
    }

    const resultCacheKey = [cacheKey, normalizedQuery].join(":");
    const now = Date.now();
    const cached = songSearchResultCache.get(resultCacheKey);
    if (cached && cached.expiresAt > now) {
      return Effect.succeed(structuredClone(cached.songs));
    }

    return Effect.map(
      songCatalogReader.getSongsCatalogCached(cacheKey),
      (catalog) => {
        const results = rankSongs(catalog, normalizedQuery);
        songSearchResultCache.set(resultCacheKey, {
          expiresAt: now + SONG_SEARCH_RESULT_CACHE_TTL_MS,
          songs: results,
        });
        return structuredClone(results);
      }
    );
  });
