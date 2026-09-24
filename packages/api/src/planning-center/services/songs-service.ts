import { logger } from "@pcobooster/api/logger";
import { PlanningCenterApiError } from "@pcobooster/api/planning-center/api-error";
import type { PlanningCenterPromiseClient } from "@pcobooster/api/planning-center/promise-client";
import { PlanningCenterReadCache } from "@pcobooster/api/planning-center/services/read-cache";
import type { PCResource } from "@pcobooster/planning-center-models/types";

const log = logger.for("planning-center/songs");
const DEFAULT_CATALOG_TTL_MS = 15 * 60 * 1000;
const DEFAULT_CATALOG_MAX_PAGES = 15;
const SONG_DETAILS_CACHE_TTL_MS = 5 * 60 * 1000;

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

export const planningCenterSongsServiceCaches =
  createPlanningCenterSongsServiceCaches();

export class PlanningCenterSongsService {
  private readonly core: PlanningCenterPromiseClient;
  private readonly caches: PlanningCenterSongsServiceCaches;

  constructor(
    core: PlanningCenterPromiseClient,
    caches: PlanningCenterSongsServiceCaches = createPlanningCenterSongsServiceCaches()
  ) {
    this.core = core;
    this.caches = caches;
  }

  async getSongsPage(
    params: Record<string, string> = {},
    signal?: AbortSignal
  ): Promise<PCResource[]> {
    return await this.core.fetchAll("/services/v2/songs", params, 1, signal);
  }

  async getSongsCatalogCached(
    cacheKey: string,
    options?: {
      ttlMs?: number;
      maxPages?: number;
    },
    signal?: AbortSignal
  ): Promise<PCResource[]> {
    const ttlMs = options?.ttlMs ?? DEFAULT_CATALOG_TTL_MS;
    const maxPages = options?.maxPages ?? DEFAULT_CATALOG_MAX_PAGES;
    const scopedCacheKey = this.buildSongCacheKey(
      "catalog",
      cacheKey,
      String(maxPages)
    );
    const data = await this.caches.catalogs.get(
      scopedCacheKey,
      ttlMs,
      async (loadSignal) => {
        const songs = await this.core.fetchAll(
          "/services/v2/songs",
          { order: "title" },
          maxPages,
          loadSignal
        );
        log.info(
          { cacheKey: scopedCacheKey, songCount: songs.length },
          "Songs catalog cached"
        );
        return songs;
      },
      signal
    );
    return structuredClone(data);
  }

  async getSong(songId: string, signal?: AbortSignal): Promise<PCResource> {
    const resource = await this.caches.songs.get(
      this.buildSongCacheKey("song", songId),
      SONG_DETAILS_CACHE_TTL_MS,
      async (loadSignal) => {
        const response = await this.core.fetch(`/services/v2/songs/${songId}`, {
          signal: loadSignal,
        });
        return response.data;
      },
      signal
    );

    return structuredClone(resource);
  }

  async getSongArrangementsWithKeys(
    songId: string,
    signal?: AbortSignal
  ): Promise<{ data: PCResource[]; included: PCResource[] }> {
    const response = await this.caches.arrangements.get(
      this.buildSongCacheKey("arrangements", songId),
      SONG_DETAILS_CACHE_TTL_MS,
      async (loadSignal) =>
        await this.core.fetchAllWithIncluded(
          `/services/v2/songs/${songId}/arrangements`,
          { include: "keys" },
          5,
          loadSignal
        ),
      signal
    );

    return {
      data: structuredClone(response.data),
      included: structuredClone(response.included),
    };
  }

  async getSongLastScheduledItem(
    songId: string,
    serviceTypeId: string,
    signal?: AbortSignal
  ): Promise<{ data: PCResource | null; included: PCResource[] }> {
    try {
      const response = await this.core.fetch(
        `/services/v2/songs/${songId}/last_scheduled_item?service_type=${serviceTypeId}&include=arrangement,key`,
        { signal }
      );

      return {
        data: response.data,
        included: response.included ?? [],
      };
    } catch (error) {
      if (error instanceof PlanningCenterApiError && error.status === 404) {
        return {
          data: null,
          included: [],
        };
      }
      throw error;
    }
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
