import { moduleLog } from "@pcobooster/api/logging";
import { normalizeSongCatalogEntry } from "@pcobooster/api/modules/planning-center/plan-items-shared";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterSongsService } from "@pcobooster/api/planning-center/services/songs-service";
import { DEFAULT_CATALOG_MAX_PAGES } from "@pcobooster/api/planning-center/services/songs-service";
import type {
  SongLibrary,
  SongLibraryEntry,
} from "@pcobooster/contracts/http/songs";
import { isString } from "@pcobooster/planning-center-models/json";
import type { JsonValue } from "@pcobooster/planning-center-models/json";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

const log = moduleLog("planning-center/song-library");

/** Planning Center pages hold 100 records. */
const CATALOG_PAGE_SIZE = 100;

const readDate = (value: JsonValue | undefined): Date | null => {
  if (!isString(value) || !value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Visible songs in catalog order (A to Z), with when each was added and last scheduled. */
export const toSongLibraryEntries = (
  catalog: readonly PCResource[]
): SongLibraryEntry[] =>
  catalog.flatMap((resource) => {
    const entry = normalizeSongCatalogEntry(resource);
    if (entry.hidden) {
      return [];
    }
    return [
      {
        id: entry.id,
        title: entry.title,
        author: entry.author,
        themes: entry.themes,
        lastScheduledAt: entry.lastScheduledAt,
        createdAt: readDate(resource.attributes.created_at),
      },
    ];
  });

export interface SongLibraryDependencies {
  readonly cacheScope: string;
  readonly songsService: Pick<
    PlanningCenterSongsService,
    "getSongsCatalogCached"
  >;
}

/** Reads the shared, cached song catalog that search uses; its pages are the only requests. */
export const getSongLibrary = ({
  cacheScope,
  songsService,
}: SongLibraryDependencies): Effect.Effect<SongLibrary, PlanningCenterError> =>
  Effect.gen(function* readSongLibrary() {
    const catalog = yield* songsService.getSongsCatalogCached(cacheScope);
    const songs = toSongLibraryEntries(catalog);
    const truncated =
      catalog.length >= DEFAULT_CATALOG_MAX_PAGES * CATALOG_PAGE_SIZE;
    yield* log.info("Song library read", {
      catalogCount: catalog.length,
      songCount: songs.length,
      truncated,
    });
    return { songs, truncated };
  });
