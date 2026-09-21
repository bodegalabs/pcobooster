import { PlanningCenterApiError } from "@worship-admin/api/planning-center/api-error";
import { createBasicPlanningCenterClient } from "@worship-admin/api/planning-center/core-client";
import { PlanningCenterSongsService } from "@worship-admin/api/planning-center/services/songs-service";
import { describe, expect, it, vi } from "vitest";

const createCoreClientMock = () => {
  const core = createBasicPlanningCenterClient();
  const fetchMock = vi.spyOn(core, "fetch");
  const fetchAllMock = vi.spyOn(core, "fetchAll");
  const fetchAllWithIncludedMock = vi.spyOn(core, "fetchAllWithIncluded");
  return { core, fetchMock, fetchAllMock, fetchAllWithIncludedMock };
};

describe(PlanningCenterSongsService, () => {
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

    expect(fetchAllMock).toHaveBeenCalledOnce();
    expect(fetchAllMock.mock.calls[0]?.slice(0, 3)).toStrictEqual([
      "/services/v2/songs",
      { order: "title" },
      15,
    ]);
    expect(fetchAllMock.mock.calls[0]?.[3]).toBeInstanceOf(AbortSignal);
    expect({
      sameContent: first,
      separateArrays: first !== second,
      separateResources: first[0] !== second[0],
    }).toStrictEqual({
      sameContent: second,
      separateArrays: true,
      separateResources: true,
    });

    first[0].attributes.title = "Changed locally";
    const third = await service.getSongsCatalogCached("account-1:service-1");

    expect({
      fetchCount: fetchAllMock.mock.calls.length,
      cachedTitle: second[0].attributes.title,
      laterTitle: third[0].attributes.title,
    }).toStrictEqual({
      fetchCount: 1,
      cachedTitle: "Build My Life",
      laterTitle: "Build My Life",
    });
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

    expect({
      fetchCount: fetchMock.mock.calls.length,
      sameContent: first,
      separateResources: first !== second,
    }).toStrictEqual({
      fetchCount: 1,
      sameContent: second,
      separateResources: true,
    });

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

    expect({
      fetchCount: fetchAllWithIncludedMock.mock.calls.length,
      sameContent: first,
      separateResponses: first !== second,
      separateData: first.data !== second.data,
      separateIncluded: first.included !== second.included,
    }).toStrictEqual({
      fetchCount: 1,
      sameContent: second,
      separateResponses: true,
      separateData: true,
      separateIncluded: true,
    });

    first.data[0].attributes.name = "Changed locally";
    expect(second.data[0].attributes.name).toBe("Default");
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
    ).resolves.toStrictEqual({
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
