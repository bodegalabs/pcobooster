import type { PeopleDashboardPerson } from "@pcobooster/contracts/people-schemas";
import { describe, expect, it } from "vitest";

import type { PeopleDashboardData } from "@/lib/people-dashboard";
import { getCachedPeopleDashboardPersonDetail } from "@/lib/people-dashboard-person-placeholder";

const dashboardPerson = (id: string): PeopleDashboardPerson => ({
  id,
  name: "Alex Adams",
  initials: "AA",
  photoThumbnailUrl: null,
  teams: ["Band"],
  roles: "Vocals",
  status: "Available soon",
  load: "normal",
  lastServed: "May 12",
  nextScheduled: "May 31",
  nextRehearsal: "Not scheduled",
  monthCount: 2,
  thirtyDayCount: 2,
  ninetyDayCount: 4,
  upcomingCount: 1,
  streak: "2 in 30 days",
  highlight: "Healthy cadence.",
  monthDays: [],
});

const dashboard = (): PeopleDashboardData => ({
  generatedAt: "2026-05-23T12:00:00.000Z",
  month: {
    year: 2026,
    monthIndex: 4,
    label: "May 2026",
    daysInMonth: 31,
    startsOnWeekday: 5,
  },
  teams: ["Band"],
  people: [dashboardPerson("person-1")],
  stats: {
    scheduledPeople: 1,
    highLoadPeople: 0,
    availableSoonPeople: 1,
  },
  monthDays: [],
  matrixDays: [],
  progress: {
    rosterPeopleCount: 1,
    requestedPeopleCount: 1,
    hydratedPeopleCount: 1,
  },
});

describe(getCachedPeopleDashboardPersonDetail, () => {
  it("builds a person detail placeholder from cached dashboard data", () => {
    const placeholder = getCachedPeopleDashboardPersonDetail(
      [dashboard()],
      "person-1",
      null
    );

    expect(placeholder?.person.name).toBe("Alex Adams");
    expect(placeholder?.month.label).toBe("May 2026");
    expect(placeholder?.previousMonth).toBe("2026-04");
    expect(placeholder?.nextMonth).toBe("2026-06");
    expect(placeholder?.requestBudget.scheduleRequests).toBe(0);
  });

  it("does not reuse cached dashboard data for a different requested month", () => {
    const placeholder = getCachedPeopleDashboardPersonDetail(
      [dashboard()],
      "person-1",
      "2026-06"
    );

    expect(placeholder).toBeUndefined();
  });
});
