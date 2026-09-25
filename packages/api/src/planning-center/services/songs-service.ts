import { logger } from "@pcobooster/api/logger";
import type {
  PlanningCenterCoreClient,
  PlanningCenterError,
} from "@pcobooster/api/planning-center/core-client";
import { recoverPlanningCenterFailure } from "@pcobooster/api/planning-center/recover-failure";
import { cachedRead } from "@pcobooster/api/planning-center/services/cached-read";
import { PlanningCenterReadCache } from "@pcobooster/api/planning-center/services/read-cache";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

const log = logger.for("planning-center/songs");
/** Songs change rarely and this app never writes them. */
const DEFAULT_CATALOG_TTL_MS = 60 * 60 * 1000;
export const DEFAULT_CATALOG_MAX_PAGES = 15;
const SONG_DETAILS_CACHE_TTL_MS = 5 * 60 * 1000;

interface LastScheduledItem {
  data: PCResource | null;
  included: PCResource[];
}

interface SongArrangementsResponse {
  data: PCResource[];
  included: PCResource[];
}

export interface PlanningCenterSongsServiceCaches {
  readonly catalogs: PlanningCenterReadCache<PCResource[]>;
  readonly songs: PlanningCenterReadCache<PCResource>;
  readonly arrangements: PlanningCenterReadCache<SongArrangementsResponse>;
}

export const createPlanningCenterSongsServiceCaches =
  (): PlanningCenterSongsServiceCaches => ({
    catalogs: new PlanningCenterReadCache<PCResource[]>(),
    songs: new PlanningCenterReadCache<PCResource>(),
    arrangements: new PlanningCenterReadCache<SongArrangementsResponse>(),
  });

export class PlanningCenterSongsService {
  private readonly core: PlanningCenterCoreClient;
  private readonly caches: PlanningCenterSongsServiceCaches;

  constructor(
    core: PlanningCenterCoreClient,
    caches: PlanningCenterSongsServiceCaches = createPlanningCenterSongsServiceCaches()
  ) {
    this.core = core;
    this.caches = caches;
  }

  getSongsPage(
    params: Record<string, string> = {}
  ): Effect.Effect<PCResource[], PlanningCenterError> {
    return this.core.fetchAll("/services/v2/songs", params, 1);
  }

  getSongsCatalogCached(
    cacheKey: string,
    options?: {
      ttlMs?: number;
      maxPages?: number;
    }
  ): Effect.Effect<PCResource[], PlanningCenterError> {
    const ttlMs = options?.ttlMs ?? DEFAULT_CATALOG_TTL_MS;
    const maxPages = options?.maxPages ?? DEFAULT_CATALOG_MAX_PAGES;
    const scopedCacheKey = this.buildSongCacheKey(
      "catalog",
      cacheKey,
      String(maxPages)
    );
    const load = () =>
      this.core
        .fetchAll("/services/v2/songs", { order: "title" }, maxPages)
        .pipe(
          Effect.tap((songs) =>
            Effect.sync(() => {
              log.info(
                { cacheKey: scopedCacheKey, songCount: songs.length },
                "Songs catalog cached"
              );
            })
          )
        );
    return cachedRead(this.caches.catalogs, scopedCacheKey, ttlMs, load).pipe(
      Effect.map((data) => structuredClone(data))
    );
  }

  getSong(songId: string): Effect.Effect<PCResource, PlanningCenterError> {
    return cachedRead(
      this.caches.songs,
      this.buildSongCacheKey("song", songId),
      SONG_DETAILS_CACHE_TTL_MS,
      () =>
        Effect.map(
          this.core.fetch(`/services/v2/songs/${songId}`),
          (response) => response.data
        )
    ).pipe(Effect.map((resource) => structuredClone(resource)));
  }

  getSongArrangementsWithKeys(
    songId: string
  ): Effect.Effect<SongArrangementsResponse, PlanningCenterError> {
    return cachedRead(
      this.caches.arrangements,
      this.buildSongCacheKey("arrangements", songId),
      SONG_DETAILS_CACHE_TTL_MS,
      () =>
        this.core.fetchAllWithIncluded(
          `/services/v2/songs/${songId}/arrangements`,
          { include: "keys" },
          5
        )
    ).pipe(
      Effect.map((response) => ({
        data: structuredClone(response.data),
        included: structuredClone(response.included),
      }))
    );
  }

  /** A song never scheduled for the service type has no last item. */
  getSongLastScheduledItem(
    songId: string,
    serviceTypeId: string
  ): Effect.Effect<LastScheduledItem, PlanningCenterError> {
    return this.core
      .fetch(
        `/services/v2/songs/${songId}/last_scheduled_item?service_type=${serviceTypeId}&include=arrangement,key`
      )
      .pipe(
        Effect.map((response): LastScheduledItem => ({
          data: response.data,
          included: response.included ?? [],
        })),
        recoverPlanningCenterFailure({
          kinds: ["not-found"],
          reason:
            "Song has no last scheduled item for the service type; reading none",
          details: { songId, serviceTypeId },
          fallback: (): LastScheduledItem => ({ data: null, included: [] }),
        })
      );
  }

  private buildSongCacheKey(
    kind: "catalog" | "song" | "arrangements",
    ...parts: string[]
  ): string {
    return [
      this.core.getCacheScope(),
      "songs",
      kind,
      ...parts.map((part) => encodeURIComponent(part)),
    ].join(":");
  }
}
