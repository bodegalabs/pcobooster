import type {
  PeopleDashboardActivity,
  PeopleDashboardRoster,
} from "@pcobooster/contracts/people-schemas";
import { describe, expect, it } from "vitest";

import {
  assemblePeopleDashboard,
  planPeopleDashboardBatches,
} from "@/lib/people-dashboard";

const roster = (count: number): PeopleDashboardRoster => ({
  generatedAt: "2026-05-23T12:00:00.000Z",
  month: {
    year: 2026,
    monthIndex: 4,
    label: "May 2026",
    daysInMonth: 31,
    startsOnWeekday: 5,
  },
  people: Array.from({ length: count }, (_, index) => ({
    id: `person-${index}`,
    name: `Person ${index}`,
    initials: "P",
    photoThumbnailUrl: null,
    teams: index % 2 === 0 ? ["Vocals", "Band"] : ["Band"],
  })),
});

const activity = (
  id: string,
  overrides: Partial<PeopleDashboardActivity> = {}
): PeopleDashboardActivity => ({
  id,
  roles: "Vocals",
  status: "Upcoming",
  load: "normal",
  lastServed: "May 10",
  nextScheduled: "May 31",
  monthCount: 1,
  thirtyDayCount: 1,
  ninetyDayCount: 2,
  upcomingCount: 1,
  streak: "1 in 30 days",
  highlight: "Healthy cadence.",
  monthDays: [{ day: 31, kind: "service", status: "C" }],
  ...overrides,
});

describe(planPeopleDashboardBatches, () => {
  it("splits the first requested roster people into fixed-size calls", () => {
    expect(planPeopleDashboardBatches(roster(5), 4, 3)).toStrictEqual([
      ["person-0", "person-1", "person-2"],
      ["person-3"],
    ]);
    expect(planPeopleDashboardBatches(undefined, 4, 3)).toStrictEqual([]);
  });
});

describe(assemblePeopleDashboard, () => {
  it("shows the roster summary before any activity arrives", () => {
    const dashboard = assemblePeopleDashboard(roster(3), [], 3);

    expect(dashboard.teams).toStrictEqual(["Band", "Vocals"]);
    expect(dashboard.people).toStrictEqual([]);
    expect(dashboard.progress).toStrictEqual({
      rosterPeopleCount: 3,
      requestedPeopleCount: 3,
      hydratedPeopleCount: 0,
    });
    expect(dashboard.stats).toStrictEqual({
      scheduledPeople: 0,
      highLoadPeople: 0,
      availableSoonPeople: 0,
    });
  });

  it("merges loaded activity into roster people, heaviest load first", () => {
    const dashboard = assemblePeopleDashboard(
      roster(4),
      [
        activity("person-0", { load: "low", monthCount: 0 }),
        activity("person-1", { load: "rest", monthCount: 4 }),
        activity("person-2", {
          load: "high",
          monthCount: 3,
          monthDays: [
            { day: 3, kind: "rehearsal" },
            { day: 4, kind: "service", status: "U" },
          ],
        }),
        activity("person-9"),
      ],
      8
    );

    expect(dashboard.people.map(({ id }) => id)).toStrictEqual([
      "person-1",
      "person-2",
      "person-0",
    ]);
    expect(dashboard.people[0]).toMatchObject({
      id: "person-1",
      name: "Person 1",
      teams: ["Band"],
      load: "rest",
    });
    expect(dashboard.stats).toStrictEqual({
      scheduledPeople: 2,
      highLoadPeople: 2,
      availableSoonPeople: 1,
    });
    expect(dashboard.monthDays.find(({ day }) => day === 4)).toStrictEqual({
      day: 4,
      serviceCount: 1,
      confirmedServiceCount: 0,
      potentialServiceCount: 1,
      rehearsalCount: 0,
      blockoutCount: 0,
    });
    expect({
      matrixDays: dashboard.matrixDays,
      progress: dashboard.progress,
    }).toStrictEqual({
      matrixDays: [4, 31],
      progress: {
        rosterPeopleCount: 4,
        requestedPeopleCount: 4,
        hydratedPeopleCount: 3,
      },
    });
  });
});
