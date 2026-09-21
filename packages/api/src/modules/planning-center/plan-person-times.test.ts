import { updatePlanPersonTimes } from "@worship-admin/api/modules/planning-center/plan-person-times";
import type { UpdatePlanPersonTimesDependencies } from "@worship-admin/api/modules/planning-center/plan-person-times";
import { describe, expect, it, vi } from "vitest";

describe(updatePlanPersonTimes, () => {
  it("invalidates only the active credential scope after updating assignments", async () => {
    const update = vi
      .fn<
        UpdatePlanPersonTimesDependencies["peopleService"]["updatePlanPersonTimes"]
      >()
      .mockResolvedValue({
        id: "plan-person-1",
        type: "PlanPerson",
        attributes: {},
      });
    const invalidateReads =
      vi.fn<
        UpdatePlanPersonTimesDependencies["peopleService"]["invalidatePlanTimeSensitiveReadCaches"]
      >();
    const getCacheScope = vi
      .fn<UpdatePlanPersonTimesDependencies["peopleService"]["getCacheScope"]>()
      .mockReturnValue("bearer:request-account");
    const invalidateHistory =
      vi.fn<UpdatePlanPersonTimesDependencies["invalidateHistory"]>();

    await updatePlanPersonTimes(
      {
        serviceTypeId: "service-type-1",
        planId: "plan-1",
        personId: "person-1",
        planPersonId: "plan-person-1",
        planTimeIds: ["time-1"],
      },
      {
        peopleService: {
          updatePlanPersonTimes: update,
          invalidatePlanTimeSensitiveReadCaches: invalidateReads,
          getCacheScope,
        },
        invalidateHistory,
      }
    );

    expect(invalidateReads).toHaveBeenCalledWith("plan-1");
    expect(invalidateHistory).toHaveBeenCalledWith("bearer:request-account");
  });
});
