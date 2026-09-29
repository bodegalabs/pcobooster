import {
  ADJACENT_PLANS_PAGE_SIZE,
  getAdjacentPlan,
} from "@pcobooster/api/modules/planning-center/get-adjacent-plan";
import type { AdjacentPlanDependencies } from "@pcobooster/api/modules/planning-center/get-adjacent-plan";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const plan = (id: string, sortDate: string): PCResource => ({
  id,
  type: "Plan",
  attributes: { title: id, sort_date: sortDate },
});

const createFixture = (current: PCResource, page: PCResource[]) => {
  const getPlansPage = vi.fn<
    AdjacentPlanDependencies["plansService"]["getPlansPage"]
  >(() => Effect.succeed(page));
  const dependencies: AdjacentPlanDependencies = {
    plansService: {
      getPlanForServiceTypeWithSeries: () =>
        Effect.succeed({ data: current, included: [] }),
      getPlansPage,
    },
    resolveTimeZone: Effect.succeed("America/Los_Angeles"),
  };
  return { dependencies, getPlansPage };
};

const sunday = plan("sun-am", "2026-09-27T17:00:00Z");

describe(getAdjacentPlan, () => {
  it("finds the latest plan before this one, same-day services included", async () => {
    const { dependencies, getPlansPage } = createFixture(sunday, [
      plan("sun-pm", "2026-09-28T01:00:00Z"),
      sunday,
      plan("sun-early", "2026-09-27T15:00:00Z"),
      plan("last-week", "2026-09-20T17:00:00Z"),
    ]);

    const previous = await Effect.runPromise(
      getAdjacentPlan("st-1", "sun-am", "previous", dependencies)
    );

    expect(previous?.id).toBe("sun-early");
    expect(getPlansPage).toHaveBeenCalledWith(
      "st-1",
      { filter: "before", before: "2026-09-28" },
      "-sort_date",
      ADJACENT_PLANS_PAGE_SIZE
    );
  });

  it("finds the earliest plan after this one", async () => {
    const { dependencies, getPlansPage } = createFixture(sunday, [
      sunday,
      plan("sun-pm", "2026-09-28T01:00:00Z"),
      plan("next-week", "2026-10-04T17:00:00Z"),
    ]);

    const next = await Effect.runPromise(
      getAdjacentPlan("st-1", "sun-am", "next", dependencies)
    );

    expect(next?.id).toBe("sun-pm");
    expect(getPlansPage).toHaveBeenCalledWith(
      "st-1",
      { filter: "after", after: "2026-09-26" },
      "sort_date",
      ADJACENT_PLANS_PAGE_SIZE
    );
  });

  it("returns null when nothing is on that side", async () => {
    const { dependencies } = createFixture(sunday, [sunday]);

    await expect(
      Effect.runPromise(
        getAdjacentPlan("st-1", "sun-am", "previous", dependencies)
      )
    ).resolves.toBeNull();
  });
});
