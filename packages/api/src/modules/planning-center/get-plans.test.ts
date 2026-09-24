import { getPlansForServiceType } from "@pcobooster/api/modules/planning-center/get-plans";
import type { PlanningCenterPlansService } from "@pcobooster/api/planning-center/services/plans-service";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

describe(getPlansForServiceType, () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns bounded, sorted plans from today through next 2 months", async () => {
    vi.useFakeTimers({ now: new Date("2026-06-15T15:00:00.000Z") });

    const getPlansInDateRangeMock =
      vi.fn<PlanningCenterPlansService["getPlansInDateRange"]>();

    getPlansInDateRangeMock.mockReturnValue(
      Effect.succeed([
        {
          id: "today",
          type: "Plan",
          attributes: {
            title: "Today",
            created_at: "2026-06-05T12:00:00.000Z",
            sort_date: "2026-06-15T12:00:00.000Z",
          },
        },
        {
          id: "future-1",
          type: "Plan",
          attributes: {
            title: "Future",
            created_at: "2026-06-05T12:00:00.000Z",
            sort_date: "2026-06-17T12:00:00.000Z",
          },
        },
      ])
    );

    const plans = await Effect.runPromise(
      getPlansForServiceType("686882", {
        plansService: { getPlansInDateRange: getPlansInDateRangeMock },
        resolveTimeZone: Effect.succeed("UTC"),
      })
    );

    expect(plans.map((p) => p.id)).toStrictEqual(["today", "future-1"]);
    expect(getPlansInDateRangeMock).toHaveBeenCalledWith(
      "686882",
      "2026-06-15",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
      "UTC"
    );
    const [firstCall] = getPlansInDateRangeMock.mock.calls;
    const [, afterKey, beforeKey] = firstCall;
    expect(beforeKey.localeCompare(afterKey)).toBeGreaterThanOrEqual(0);
  });

  it("normalizes untitled plans and absent series titles from Planning Center", async () => {
    const getPlansInDateRangeMock =
      vi.fn<PlanningCenterPlansService["getPlansInDateRange"]>();
    getPlansInDateRangeMock.mockReturnValue(
      Effect.succeed([
        {
          id: "untitled",
          type: "Plan",
          attributes: {
            title: null,
            series_title: null,
            created_at: "2026-06-05T12:00:00.000Z",
            sort_date: "2026-06-15T12:00:00.000Z",
          },
        },
      ])
    );

    const plans = await Effect.runPromise(
      getPlansForServiceType("686882", {
        plansService: { getPlansInDateRange: getPlansInDateRangeMock },
        resolveTimeZone: Effect.succeed("UTC"),
      })
    );

    expect(plans).toMatchObject([
      { id: "untitled", title: "", seriesTitle: undefined },
    ]);
  });
});
