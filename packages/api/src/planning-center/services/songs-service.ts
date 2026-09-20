import { logger } from "@worship-admin/api/logger";
import { PlanningCenterApiError } from "@worship-admin/api/planning-center/api-error";
import { PlanningCenterCoreClient } from "@worship-admin/api/planning-center/core-client";
import { PlanningCenterReadCache } from "@worship-admin/api/planning-center/services/read-cache";
import type { PCResource } from "@worship-admin/api/types";

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
  private readonly core: PlanningCenterCoreClient;
  private readonly caches: PlanningCenterSongsServiceCaches;

  constructor(
    core: PlanningCenterCoreClient,
    caches: PlanningCenterSongsServiceCaches = createPlanningCenterSongsServiceCaches()
  ) {
    this.core = core;
    this.caches = caches;
  }

  async getSongsPage(
    params: Record<string, string> = {}
  ): Promise<PCResource[]> {
    return await this.core.fetchAll("/services/v2/songs", params, 1);
  }

  async getSongsCatalogCached(
    cacheKey: string,
    options?: {
      ttlMs?: number;
      maxPages?: number;
    }
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
      async () => {
        const songs = await this.core.fetchAll(
          "/services/v2/songs",
          { order: "title" },
          maxPages
        );
        log.info(
          { cacheKey: scopedCacheKey, songCount: songs.length },
          "Songs catalog cached"
        );
        return songs;
      }
    );
    return structuredClone(data);
  }

  async getSong(songId: string): Promise<PCResource> {
    const resource = await this.caches.songs.get(
      this.buildSongCacheKey("song", songId),
      SONG_DETAILS_CACHE_TTL_MS,
      async () => {
        const response = await this.core.fetch(`/services/v2/songs/${songId}`);
        return response.data;
      }
    );

    return structuredClone(resource);
  }

  async getSongArrangementsWithKeys(
    songId: string
  ): Promise<{ data: PCResource[]; included: PCResource[] }> {
    const response = await this.caches.arrangements.get(
      this.buildSongCacheKey("arrangements", songId),
      SONG_DETAILS_CACHE_TTL_MS,
      async () =>
        await this.core.fetchAllWithIncluded(
          `/services/v2/songs/${songId}/arrangements`,
          { include: "keys" }
        )
    );

    return {
      data: structuredClone(response.data),
      included: structuredClone(response.included),
    };
  }

  async getSongLastScheduledItem(
    songId: string,
    serviceTypeId: string
  ): Promise<{ data: PCResource | null; included: PCResource[] }> {
    try {
      const response = await this.core.fetch(
        `/services/v2/songs/${songId}/last_scheduled_item?service_type=${serviceTypeId}&include=arrangement,key`
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

export const planningCenterSongsService = new PlanningCenterSongsService(
  new PlanningCenterCoreClient(),
  planningCenterSongsServiceCaches
);
