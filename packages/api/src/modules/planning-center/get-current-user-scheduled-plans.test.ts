import { getCurrentUserScheduledPlanIds } from "@pcobooster/api/modules/planning-center/get-current-user-scheduled-plans";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

const schedule = (id: string, planId: string | null): PCResource => ({
  type: "Schedule",
  id,
  attributes: {},
  relationships:
    planId === null ? {} : { plan: { data: { type: "Plan", id: planId } } },
});

const setup = (schedules: PCResource[]) => {
  const getPersonSchedulesAfter = vi.fn<
    (
      personId: string,
      after: string,
      maxPages?: number
    ) => Effect.Effect<{ data: PCResource[]; included: PCResource[] }>
  >(() => Effect.succeed({ data: schedules, included: [] }));
  const read = async () =>
    await Effect.runPromise(
      getCurrentUserScheduledPlanIds(
        new Request("https://example.test"),
        { id: "account-1", accountId: "pc-account-1" },
        {
          isDevAuthBypassEnabled: () => false,
          loadDevBypassIdentity: async () =>
            await Promise.reject(new Error("not used")),
          getPlanningCenterIdentityForAccount: async () =>
            await Promise.resolve({
              sub: "person-7",
              name: null,
              email: null,
              organizationId: null,
              organizationName: null,
            }),
          peopleService: { getPersonSchedulesAfter },
          resolveTimeZone: Effect.succeed("America/Los_Angeles"),
        }
      )
    );
  return { getPersonSchedulesAfter, read };
};

describe(getCurrentUserScheduledPlanIds, () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the person's schedules from today's org day, not the UTC day", async () => {
    vi.useFakeTimers();
    // 03:00 UTC on Sep 29 is still Sep 28 in Los Angeles.
    vi.setSystemTime(new Date("2026-09-29T03:00:00.000Z"));
    const { getPersonSchedulesAfter, read } = setup([]);

    await expect(read()).resolves.toStrictEqual([]);
    expect(getPersonSchedulesAfter).toHaveBeenCalledWith(
      "person-7",
      "2026-09-28",
      2
    );
  });

  it("returns each scheduled plan once and skips schedules without a plan", async () => {
    const { read } = setup([
      schedule("s-1", "plan-1"),
      schedule("s-2", "plan-1"),
      schedule("s-3", null),
      schedule("s-4", "plan-2"),
    ]);

    await expect(read()).resolves.toStrictEqual(["plan-1", "plan-2"]);
  });
});
