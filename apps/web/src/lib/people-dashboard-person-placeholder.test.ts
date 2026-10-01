import type { PeopleDashboardRoster } from "@pcobooster/contracts/people-schemas";
import { describe, expect, it } from "vitest";

import { assemblePeopleDashboard } from "@/lib/people-dashboard";
import { getCachedPeopleDashboardPersonDetail } from "@/lib/people-dashboard-person-placeholder";

const rhythm = {
  lastServedOn: "2026-05-10",
  nextServingOn: "2026-05-31",
  servedDays30: 1,
  servedDays90: 2,
  servedDays180: 4,
  upcomingDays30: 1,
  typicalGapDays: 21,
  requests180: 5,
  declined180: 0,
  pendingUpcoming: 1,
  nextPendingOn: "2026-05-31",
};

const roster: PeopleDashboardRoster = {
  generatedAt: "2026-05-23T12:00:00.000Z",
  month: {
    year: 2026,
    monthIndex: 4,
    label: "May 2026",
    daysInMonth: 31,
    startsOnWeekday: 5,
  },
  people: [
    {
      id: "person-1",
      name: "Alex Adams",
      initials: "AA",
      photoThumbnailUrl: null,
      teams: ["Band"],
    },
  ],
  teams: [
    {
      id: "team-1",
      name: "Band",
      serviceTypeName: null,
      personIds: ["person-1"],
    },
  ],
  ledTeamIds: [],
};

const dashboard = () =>
  assemblePeopleDashboard(
    roster,
    [{ id: "person-1", rhythm, roles: ["Vocals"], monthDays: [] }],
    {
      scopePersonIds: ["person-1"],
      samplePeopleCount: 1,
      loadingPersonIds: new Set(),
    }
  );

describe(getCachedPeopleDashboardPersonDetail, () => {
  it("builds a person detail placeholder, rhythm included, from cached dashboard data", () => {
    const placeholder = getCachedPeopleDashboardPersonDetail(
      [dashboard()],
      "person-1",
      null
    );

    expect(placeholder?.person).toMatchObject({
      name: "Alex Adams",
      teams: ["Band"],
      roles: ["Vocals"],
      rhythm,
    });
    expect(placeholder?.month.label).toBe("May 2026");
    expect(placeholder?.previousMonth).toBe("2026-04");
    expect(placeholder?.nextMonth).toBe("2026-06");
    expect(placeholder?.requestBudget.unresolvedRehearsalTimes).toBe(0);
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
