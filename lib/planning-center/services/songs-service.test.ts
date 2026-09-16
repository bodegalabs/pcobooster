import { describe, expect, it, vi } from "vitest";

import {
  PlanningCenterApiError,
  type PlanningCenterCoreClient,
} from "@/lib/planning-center/core-client";
import { PlanningCenterSongsService } from "@/lib/planning-center/services/songs-service";

function createCoreClientMock() {
  const fetchMock = vi.fn();
  const fetchAllMock = vi.fn();
  const fetchAllWithIncludedMock = vi.fn();
  const core = {
    fetch: fetchMock,
    fetchAll: fetchAllMock,
    fetchAllWithIncluded: fetchAllWithIncludedMock,
    getCacheScope: vi.fn(() => "test-scope"),
  } as unknown as PlanningCenterCoreClient;
  return { core, fetchMock, fetchAllMock, fetchAllWithIncludedMock };
}

describe("PlanningCenterSongsService", () => {
  it("dedupes song catalog loads and returns defensive clones", async () => {
    const { core, fetchAllMock } = createCoreClientMock();
    fetchAllMock.mockResolvedValue([
      {
        id: "song-1",
        type: "Song",
        attributes: { title: "Build My Life" },
      },
    ]);

    const service = new PlanningCenterSongsService(core);
    const [first, second] = await Promise.all([
      service.getSongsCatalogCached("account-1:service-1"),
      service.getSongsCatalogCached("account-1:service-1"),
    ]);

    expect(fetchAllMock).toHaveBeenCalledTimes(1);
    expect(fetchAllMock).toHaveBeenCalledWith(
      "/services/v2/songs",
      { order: "title" },
      15
    );
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);

    first[0]!.attributes.title = "Changed locally";
    const third = await service.getSongsCatalogCached("account-1:service-1");

    expect(fetchAllMock).toHaveBeenCalledTimes(1);
    expect(second[0]!.attributes.title).toBe("Build My Life");
    expect(third[0]!.attributes.title).toBe("Build My Life");
  });

  it("caches song details and returns defensive clones", async () => {
    const { core, fetchMock } = createCoreClientMock();
    fetchMock.mockResolvedValue({
      data: {
        id: "song-1",
        type: "Song",
        attributes: { title: "Build My Life" },
      },
    });

    const service = new PlanningCenterSongsService(core);
    const first = await service.getSong("song-1");
    const second = await service.getSong("song-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);

    first.attributes.title = "Changed locally";
    expect(second.attributes.title).toBe("Build My Life");
  });

  it("caches arrangement and key responses and returns defensive clones", async () => {
    const { core, fetchAllWithIncludedMock } = createCoreClientMock();
    fetchAllWithIncludedMock.mockResolvedValue({
      data: [
        {
          id: "arr-1",
          type: "Arrangement",
          attributes: { name: "Default" },
        },
      ],
      included: [
        {
          id: "key-1",
          type: "Key",
          attributes: { name: "G" },
        },
      ],
    });

    const service = new PlanningCenterSongsService(core);
    const first = await service.getSongArrangementsWithKeys("song-1");
    const second = await service.getSongArrangementsWithKeys("song-1");

    expect(fetchAllWithIncludedMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.data).not.toBe(second.data);
    expect(first.included).not.toBe(second.included);

    first.data[0]!.attributes.name = "Changed locally";
    expect(second.data[0]!.attributes.name).toBe("Default");
  });
});

describe("PlanningCenterSongsService.getSongLastScheduledItem", () => {
  it("returns null for 404 responses only", async () => {
    const { core, fetchMock } = createCoreClientMock();
    fetchMock.mockRejectedValueOnce(
      new PlanningCenterApiError({
        message: "Planning Center API error: 404 - Not found",
        status: 404,
      })
    );

    const service = new PlanningCenterSongsService(core);

    await expect(
      service.getSongLastScheduledItem("song-1", "service-1")
    ).resolves.toEqual({
      data: null,
      included: [],
    });
  });

  it("rethrows non-404 Planning Center errors", async () => {
    const { core, fetchMock } = createCoreClientMock();
    const error = new PlanningCenterApiError({
      message: "Planning Center API error: 500 - Internal error",
      status: 500,
    });
    fetchMock.mockRejectedValueOnce(error);

    const service = new PlanningCenterSongsService(core);

    await expect(
      service.getSongLastScheduledItem("song-1", "service-1")
    ).rejects.toBe(error);
  });
});
