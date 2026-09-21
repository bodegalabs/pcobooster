import { getScheduleHistory } from "@worship-admin/api/use-cases/planning-center/get-schedule-history";
import type { ScheduleHistoryDependencies } from "@worship-admin/api/use-cases/planning-center/get-schedule-history";
import { describe, expect, it, vi } from "vitest";

const createFixture = () => {
  const getPersonSchedulesMock =
    vi.fn<ScheduleHistoryDependencies["peopleService"]["getPersonSchedules"]>();
  const resolveTimeZoneMock = vi
    .fn<ScheduleHistoryDependencies["resolveTimeZone"]>()
    .mockResolvedValue("UTC");
  const dependencies = {
    peopleService: { getPersonSchedules: getPersonSchedulesMock },
    resolveTimeZone: resolveTimeZoneMock,
  } satisfies ScheduleHistoryDependencies;
  return { getPersonSchedulesMock, dependencies };
};

describe(getScheduleHistory, () => {
  it("includes confirmed records and computes frequency", async () => {
    const { getPersonSchedulesMock, dependencies } = createFixture();
    const now = new Date();
    const iso = (offsetDays: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() + offsetDays);
      return d.toISOString();
    };

    getPersonSchedulesMock.mockResolvedValue({
      data: [
        {
          id: "sch-1",
          type: "Schedule",
          attributes: {
            status: "Confirmed",
            sort_date: iso(-5),
            team_name: "Band",
            service_type_name: "Sunday",
            team_position_name: "Band - Electric",
          },
          relationships: {
            plan: { data: { id: "p-1", type: "Plan" } },
            service_type: { data: { id: "ok-st", type: "ServiceType" } },
          },
        },
        {
          id: "sch-2",
          type: "Schedule",
          attributes: {
            status: "U",
            sort_date: iso(-3),
            team_name: "Band",
            service_type_name: "Sunday",
            team_position_name: "Band - Electric",
          },
          relationships: {
            plan: { data: { id: "p-2", type: "Plan" } },
            service_type: { data: { id: "ok-st", type: "ServiceType" } },
          },
        },
        {
          id: "sch-3",
          type: "Schedule",
          attributes: {
            status: "C",
            sort_date: iso(-2),
            team_name: "Band",
            service_type_name: "Excluded",
            team_position_name: "Band - Electric",
          },
          relationships: {
            plan: { data: { id: "p-3", type: "Plan" } },
            service_type: { data: { id: "st-excluded", type: "ServiceType" } },
          },
        },
      ],
      included: [
        {
          id: "p-1",
          type: "Plan",
          attributes: {
            title: "Past Plan",
            sort_date: iso(-5),
            created_at: iso(-5),
          },
          relationships: {
            service_type: { data: { id: "ok-st", type: "ServiceType" } },
          },
        },
        {
          id: "p-2",
          type: "Plan",
          attributes: {
            title: "Unconfirmed Plan",
            sort_date: iso(-3),
            created_at: iso(-3),
          },
          relationships: {
            service_type: { data: { id: "ok-st", type: "ServiceType" } },
          },
        },
        {
          id: "p-3",
          type: "Plan",
          attributes: {
            title: "Excluded Plan",
            sort_date: iso(-2),
            created_at: iso(-2),
          },
          relationships: {
            service_type: { data: { id: "st-excluded", type: "ServiceType" } },
          },
        },
      ],
    });

    const result = await getScheduleHistory("person-1", 90, dependencies);
    expect(result.planPeople.map((p) => p.id)).toStrictEqual([
      "sch-3",
      "sch-1",
    ]);
    expect(result.frequency.recentServedDays).toBe(2);
    expect(result.frequency.totalServed).toBe(2);
  });
});
