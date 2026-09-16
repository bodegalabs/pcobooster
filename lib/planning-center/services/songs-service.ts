import { logger } from "@/lib/logger";
import { PlanningCenterApiError } from "@/lib/planning-center/api-error";
import { PlanningCenterCoreClient } from "@/lib/planning-center/core-client";
import { PlanningCenterReadCache } from "@/lib/planning-center/services/read-cache";
import type { PCResource } from "@/lib/types";

const log = logger.for("planning-center/songs");
const DEFAULT_CATALOG_TTL_MS = 15 * 60 * 1000;
const DEFAULT_CATALOG_MAX_PAGES = 15;
const SONG_DETAILS_CACHE_TTL_MS = 5 * 60 * 1000;

interface CatalogCacheEntry {
  expiresAt: number;
  promise: Promise<PCResource[]>;
}

export class PlanningCenterSongsService {
  private readonly catalogCache = new Map<string, CatalogCacheEntry>();
  private readonly songCache = new PlanningCenterReadCache<PCResource>();
  private readonly arrangementsCache = new PlanningCenterReadCache<{
    data: PCResource[];
    included: PCResource[];
  }>();
  private readonly core: PlanningCenterCoreClient;

  constructor(core: PlanningCenterCoreClient) {
    this.core = core;
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
    const now = Date.now();
    const ttlMs = options?.ttlMs ?? DEFAULT_CATALOG_TTL_MS;
    const maxPages = options?.maxPages ?? DEFAULT_CATALOG_MAX_PAGES;
    const cached = this.catalogCache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      return structuredClone(await cached.promise);
    }

    const promise = this.core.fetchAll(
      "/services/v2/songs",
      { order: "title" },
      maxPages
    );

    this.catalogCache.set(cacheKey, {
      expiresAt: now + ttlMs,
      promise,
    });

    try {
      const data = await promise;
      log.info({ cacheKey, songCount: data.length }, "Songs catalog cached");
      return structuredClone(data);
    } catch (error) {
      if (this.catalogCache.get(cacheKey)?.promise === promise) {
        this.catalogCache.delete(cacheKey);
      }
      throw error;
    }
  }

  async getSong(songId: string): Promise<PCResource> {
    const resource = await this.songCache.get(
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
    const response = await this.arrangementsCache.get(
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
    kind: "song" | "arrangements",
    songId: string
  ): string {
    return [
      this.core.getCacheScope(),
      "songs",
      kind,
      encodeURIComponent(songId),
    ].join(":");
  }
}

export const planningCenterSongsService = new PlanningCenterSongsService(
  new PlanningCenterCoreClient()
);
