import { updatePlanPersonTimes } from "@pcobooster/api/modules/planning-center/plan-person-times";
import type { UpdatePlanPersonTimesDependencies } from "@pcobooster/api/modules/planning-center/plan-person-times";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

describe(updatePlanPersonTimes, () => {
  it("clears plan-time reads and the window rosters after updating assignments", async () => {
    const update = vi
      .fn<
        UpdatePlanPersonTimesDependencies["peopleService"]["updatePlanPersonTimes"]
      >()
      .mockReturnValue(
        Effect.succeed({
          id: "plan-person-1",
          type: "PlanPerson",
          attributes: {},
        })
      );
    const invalidateReads =
      vi.fn<
        UpdatePlanPersonTimesDependencies["peopleService"]["invalidatePlanTimeSensitiveReadCaches"]
      >();
    const invalidateWindowRosters =
      vi.fn<
        UpdatePlanPersonTimesDependencies["peopleService"]["invalidatePlanWindowRosters"]
      >();

    await Effect.runPromise(
      updatePlanPersonTimes(
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
            invalidatePlanWindowRosters: invalidateWindowRosters,
          },
        }
      )
    );

    expect(invalidateReads).toHaveBeenCalledWith("plan-1");
    expect(invalidateWindowRosters).toHaveBeenCalledOnce();
  });
});
