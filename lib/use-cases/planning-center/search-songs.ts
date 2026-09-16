import { planningCenterSongsService } from "@/lib/planning-center/services/songs-service";
import type { PlanningCenterSongsService } from "@/lib/planning-center/services/songs-service";
import type { SongCatalogEntry } from "@/lib/types";
import {
  normalizeSongCatalogEntry,
  scoreSongSearch,
} from "@/lib/use-cases/planning-center/plan-items-shared";

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

export const searchSongs = async (
  cacheKey: string,
  serviceTypeId: string,
  query: string,
  songCatalogReader: SongCatalogReader = planningCenterSongsService
): Promise<SongCatalogEntry[]> => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const resultCacheKey = [cacheKey, serviceTypeId, normalizedQuery].join(":");
  const now = Date.now();
  const cached = songSearchResultCache.get(resultCacheKey);
  if (cached && cached.expiresAt > now) {
    return structuredClone(cached.songs);
  }

  const catalog = await songCatalogReader.getSongsCatalogCached(
    `${cacheKey}:${serviceTypeId}`
  );
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

  const results = normalized.slice(0, MAX_RESULTS);
  songSearchResultCache.set(resultCacheKey, {
    expiresAt: now + SONG_SEARCH_RESULT_CACHE_TTL_MS,
    songs: results,
  });

  return structuredClone(results);
};
