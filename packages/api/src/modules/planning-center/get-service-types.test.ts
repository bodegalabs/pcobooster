import { getServiceTypes } from "@pcobooster/api/modules/planning-center/get-service-types";
import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

describe(getServiceTypes, () => {
  it("filters archived service types and sorts by sequence", async () => {
    const getServiceTypesCachedMock =
      vi.fn<PlanningCenterCatalogService["getServiceTypesCached"]>();
    getServiceTypesCachedMock.mockReturnValue(
      Effect.succeed([
        {
          id: "st-excluded",
          type: "ServiceType",
          attributes: { name: "Excluded", sequence: 1, archived_at: null },
        },
        {
          id: "active-2",
          type: "ServiceType",
          attributes: { name: "Second", sequence: 20, archived_at: null },
        },
        {
          id: "archived",
          type: "ServiceType",
          attributes: {
            name: "Archived",
            sequence: 10,
            archived_at: "2025-01-01T00:00:00Z",
          },
        },
        {
          id: "active-1",
          type: "ServiceType",
          attributes: { name: "First", sequence: 5, archived_at: null },
        },
      ])
    );

    const result = await Effect.runPromise(
      getServiceTypes({
        getServiceTypesCached: getServiceTypesCachedMock,
      })
    );
    expect(result.map((s) => s.id)).toStrictEqual([
      "st-excluded",
      "active-1",
      "active-2",
    ]);
  });
});
