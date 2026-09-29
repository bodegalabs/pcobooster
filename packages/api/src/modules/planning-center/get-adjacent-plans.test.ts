import {
  ADJACENT_PLANS_PAGE_SIZE,
  getAdjacentPlans,
} from "@pcobooster/api/modules/planning-center/get-adjacent-plans";
import type { AdjacentPlanDependencies } from "@pcobooster/api/modules/planning-center/get-adjacent-plans";
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

const ids = (plans: readonly { id: string }[]) => plans.map(({ id }) => id);

describe(getAdjacentPlans, () => {
  it("lists plans before this one nearest first, same-day services included", async () => {
    const { dependencies, getPlansPage } = createFixture(sunday, [
      plan("sun-pm", "2026-09-28T01:00:00Z"),
      sunday,
      plan("sun-early", "2026-09-27T15:00:00Z"),
      plan("last-week", "2026-09-20T17:00:00Z"),
    ]);

    const previous = await Effect.runPromise(
      getAdjacentPlans("st-1", "sun-am", "previous", dependencies)
    );

    expect(ids(previous)).toStrictEqual(["sun-early", "last-week"]);
    expect(getPlansPage).toHaveBeenCalledWith(
      "st-1",
      { filter: "before", before: "2026-09-28" },
      "-sort_date",
      ADJACENT_PLANS_PAGE_SIZE
    );
  });

  it("lists plans after this one nearest first", async () => {
    const { dependencies, getPlansPage } = createFixture(sunday, [
      sunday,
      plan("sun-pm", "2026-09-28T01:00:00Z"),
      plan("next-week", "2026-10-04T17:00:00Z"),
    ]);

    const next = await Effect.runPromise(
      getAdjacentPlans("st-1", "sun-am", "next", dependencies)
    );

    expect(ids(next)).toStrictEqual(["sun-pm", "next-week"]);
    expect(getPlansPage).toHaveBeenCalledWith(
      "st-1",
      { filter: "after", after: "2026-09-26" },
      "sort_date",
      ADJACENT_PLANS_PAGE_SIZE
    );
  });

  it("keeps the four nearest", async () => {
    const { dependencies } = createFixture(sunday, [
      sunday,
      plan("w1", "2026-10-04T17:00:00Z"),
      plan("w2", "2026-10-11T17:00:00Z"),
      plan("w3", "2026-10-18T17:00:00Z"),
      plan("w4", "2026-10-25T17:00:00Z"),
      plan("w5", "2026-11-01T17:00:00Z"),
    ]);

    const next = await Effect.runPromise(
      getAdjacentPlans("st-1", "sun-am", "next", dependencies)
    );

    expect(ids(next)).toStrictEqual(["w1", "w2", "w3", "w4"]);
  });

  it("returns nothing when nothing is on that side", async () => {
    const { dependencies } = createFixture(sunday, [sunday]);

    await expect(
      Effect.runPromise(
        getAdjacentPlans("st-1", "sun-am", "previous", dependencies)
      )
    ).resolves.toStrictEqual([]);
  });
});
