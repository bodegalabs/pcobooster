import { afterEach, describe, expect, it, vi } from "vitest";

import { getPlansForServiceType } from "@/lib/use-cases/planning-center/get-plans";

const { getPlansInDateRangeMock } = vi.hoisted(() => ({
  getPlansInDateRangeMock: vi.fn(),
}));

vi.mock("@/lib/planning-center/resolve-organization-timezone", () => ({
  resolveOrganizationTimeZone: vi.fn(() => Promise.resolve("UTC")),
}));

vi.mock("@/lib/planning-center/services/plans-service", () => ({
  planningCenterPlansService: {
    getPlansInDateRange: getPlansInDateRangeMock,
  },
}));

describe("getPlansForServiceType", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns bounded, sorted plans from today through next 2 months", async () => {
    vi.useFakeTimers({ now: new Date("2026-06-15T15:00:00.000Z") });

    getPlansInDateRangeMock.mockResolvedValue([
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
    ]);

    const plans = await getPlansForServiceType("686882");

    expect(plans.map((p) => p.id)).toEqual(["today", "future-1"]);
    expect(getPlansInDateRangeMock).toHaveBeenCalledWith(
      "686882",
      "2026-06-15",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
    );
    const [, afterKey, beforeKey] = getPlansInDateRangeMock.mock.calls[0]!;
    expect(beforeKey >= afterKey).toBe(true);
  });
});
