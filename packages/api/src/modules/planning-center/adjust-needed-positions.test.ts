import { adjustNeededPositions } from "@pcobooster/api/modules/planning-center/adjust-needed-positions";
import type { NeededPositionsDependencies } from "@pcobooster/api/modules/planning-center/adjust-needed-positions";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const needed = (
  id: string,
  teamId: string,
  positionName: string,
  quantity: number
): PCResource => ({
  id,
  type: "NeededPosition",
  attributes: { quantity, team_position_name: positionName },
  relationships: { team: { data: { type: "Team", id: teamId } } },
});

type CatalogService = NeededPositionsDependencies["catalogService"];

const createFixture = (records: PCResource[]) => {
  const catalogService = {
    invalidateNeededPositionsCache:
      vi.fn<CatalogService["invalidateNeededPositionsCache"]>(),
    getServiceTypePlanNeededPositionsWithTeams: vi.fn<
      CatalogService["getServiceTypePlanNeededPositionsWithTeams"]
    >(() => Effect.succeed({ data: records, included: [] })),
    updateServiceTypePlanNeededPositionQuantity: vi.fn<
      CatalogService["updateServiceTypePlanNeededPositionQuantity"]
    >(() => Effect.void),
    deleteServiceTypePlanNeededPosition: vi.fn<
      CatalogService["deleteServiceTypePlanNeededPosition"]
    >(() => Effect.void),
  } satisfies CatalogService;
  return { dependencies: { catalogService }, catalogService };
};

const camera = {
  serviceTypeId: "st-1",
  planId: "plan-1",
  teamId: "team-av",
  positionName: "Camera 1",
};

describe(adjustNeededPositions, () => {
  it("adds an open slot to the position's first record", async () => {
    const { dependencies, catalogService } = createFixture([
      needed("np-1", "team-av", "Camera 1", 1),
      needed("np-2", "team-av", "camera 1 ", 2),
      needed("np-3", "team-band", "Camera 1", 4),
    ]);

    const result = await Effect.runPromise(
      adjustNeededPositions({ ...camera, change: "add" }, dependencies)
    );

    expect(result).toStrictEqual({ openCount: 4 });
    expect(
      catalogService.updateServiceTypePlanNeededPositionQuantity
    ).toHaveBeenCalledWith("st-1", "plan-1", "np-1", 2);
    expect(catalogService.invalidateNeededPositionsCache).toHaveBeenCalledWith(
      "st-1",
      "plan-1"
    );
  });

  it("removes an open slot from the position's last record", async () => {
    const { dependencies, catalogService } = createFixture([
      needed("np-1", "team-av", "Camera 1", 1),
      needed("np-2", "team-av", "Camera 1", 2),
    ]);

    const result = await Effect.runPromise(
      adjustNeededPositions({ ...camera, change: "remove" }, dependencies)
    );

    expect(result).toStrictEqual({ openCount: 2 });
    expect(
      catalogService.updateServiceTypePlanNeededPositionQuantity
    ).toHaveBeenCalledWith("st-1", "plan-1", "np-2", 1);
    expect(
      catalogService.deleteServiceTypePlanNeededPosition
    ).not.toHaveBeenCalled();
  });

  it("deletes a record when its last open slot goes", async () => {
    const { dependencies, catalogService } = createFixture([
      needed("np-1", "team-av", "Camera 1", 1),
    ]);

    const result = await Effect.runPromise(
      adjustNeededPositions({ ...camera, change: "remove" }, dependencies)
    );

    expect(result).toStrictEqual({ openCount: 0 });
    expect(
      catalogService.deleteServiceTypePlanNeededPosition
    ).toHaveBeenCalledWith("st-1", "plan-1", "np-1");
    expect(
      catalogService.updateServiceTypePlanNeededPositionQuantity
    ).not.toHaveBeenCalled();
  });

  it("changes nothing when the position has no open-slot record", async () => {
    const { dependencies, catalogService } = createFixture([
      needed("np-1", "team-av", "Camera 2", 1),
      needed("np-2", "team-av", "Camera 1", 0),
    ]);

    const result = await Effect.runPromise(
      adjustNeededPositions({ ...camera, change: "add" }, dependencies)
    );

    expect(result).toStrictEqual({ openCount: 0 });
    expect(
      catalogService.updateServiceTypePlanNeededPositionQuantity
    ).not.toHaveBeenCalled();
    expect(
      catalogService.deleteServiceTypePlanNeededPosition
    ).not.toHaveBeenCalled();
  });
});
