import type {
  PeopleDashboardActivity,
  PeopleDashboardLoad,
  PeopleDashboardMonth,
  PeopleDashboardPerson,
  PeopleDashboardRoster,
} from "@pcobooster/contracts/people-schemas";

/** People whose schedules load without asking; more load on request. */
export const PEOPLE_DASHBOARD_SAMPLE_SIZE = 48;
/**
 * Activity calls in flight at once. Each costs about 20 Planning Center
 * requests cold, and the user's budget is 100 per 20 seconds.
 */
export const PEOPLE_DASHBOARD_BATCH_CONCURRENCY = 2;
const MATRIX_DAY_COUNT = 5;
const DAYS_IN_LONGEST_MONTH = 31;

export interface PeopleDashboardDay {
  day: number;
  serviceCount: number;
  confirmedServiceCount: number;
  potentialServiceCount: number;
  rehearsalCount: number;
  blockoutCount: number;
}

export interface PeopleDashboardProgress {
  rosterPeopleCount: number;
  /** Roster people whose schedules were requested so far. */
  requestedPeopleCount: number;
  hydratedPeopleCount: number;
}

/** The dashboard as the browser assembles it from the roster and activity batches. */
export interface PeopleDashboardData {
  generatedAt: string;
  month: PeopleDashboardMonth;
  /** Roster teams, available before any activity arrives. */
  teams: string[];
  /** People with activity loaded, heaviest load first. */
  people: PeopleDashboardPerson[];
  stats: {
    scheduledPeople: number;
    highLoadPeople: number;
    availableSoonPeople: number;
  };
  monthDays: PeopleDashboardDay[];
  matrixDays: number[];
  progress: PeopleDashboardProgress;
}

const isConfirmedStatus = (status: string | undefined) => {
  const raw = (status ?? "").trim();
  return raw === "C" || raw.toLowerCase() === "confirmed";
};

const loadRank = (load: PeopleDashboardLoad) => {
  if (load === "rest") {
    return 4;
  }
  if (load === "high") {
    return 3;
  }
  if (load === "normal") {
    return 2;
  }
  return 1;
};

const buildMonthDays = (
  people: PeopleDashboardPerson[]
): PeopleDashboardDay[] =>
  Array.from({ length: DAYS_IN_LONGEST_MONTH }, (_, index) => {
    const day = index + 1;
    const peopleWith = (
      matches: (entry: PeopleDashboardPerson["monthDays"][number]) => boolean
    ) =>
      people.filter((person) =>
        person.monthDays.some((entry) => entry.day === day && matches(entry))
      ).length;
    return {
      day,
      serviceCount: peopleWith((entry) => entry.kind === "service"),
      confirmedServiceCount: peopleWith(
        (entry) => entry.kind === "service" && isConfirmedStatus(entry.status)
      ),
      potentialServiceCount: peopleWith(
        (entry) => entry.kind === "service" && !isConfirmedStatus(entry.status)
      ),
      rehearsalCount: peopleWith((entry) => entry.kind === "rehearsal"),
      blockoutCount: peopleWith((entry) => entry.kind === "blockout"),
    };
  });

const getServiceMatrixDays = (monthDays: PeopleDashboardDay[]) => {
  const days = monthDays
    .filter((day) => day.serviceCount > 0)
    .slice(0, MATRIX_DAY_COUNT)
    .map((day) => day.day);
  return days.length > 0
    ? days
    : monthDays.slice(0, MATRIX_DAY_COUNT).map((day) => day.day);
};

/** The first `targetPeopleCount` roster people, split into activity calls. */
export const planPeopleDashboardBatches = (
  roster: PeopleDashboardRoster | undefined,
  targetPeopleCount: number,
  batchSize: number
): string[][] => {
  const ids = (roster?.people ?? [])
    .slice(0, Math.max(0, targetPeopleCount))
    .map((person) => person.id);
  const batches: string[][] = [];
  for (let start = 0; start < ids.length; start += batchSize) {
    batches.push(ids.slice(start, start + batchSize));
  }
  return batches;
};

export const assemblePeopleDashboard = (
  roster: PeopleDashboardRoster,
  activities: readonly PeopleDashboardActivity[],
  requestedPeopleCount: number
): PeopleDashboardData => {
  const activityById = new Map(
    activities.map((activity) => [activity.id, activity])
  );
  const people = roster.people
    .flatMap((person): PeopleDashboardPerson[] => {
      const activity = activityById.get(person.id);
      if (!activity) {
        return [];
      }
      const { id: _activityId, ...serving } = activity;
      return [{ ...person, ...serving }];
    })
    .toSorted(
      (a, b) =>
        loadRank(b.load) - loadRank(a.load) || b.monthCount - a.monthCount
    );
  const monthDays = buildMonthDays(people);

  return {
    generatedAt: roster.generatedAt,
    month: roster.month,
    teams: [
      ...new Set(roster.people.flatMap((person) => person.teams)),
    ].toSorted((a, b) => a.localeCompare(b)),
    people,
    stats: {
      scheduledPeople: people.filter((person) => person.monthCount > 0).length,
      highLoadPeople: people.filter(
        (person) => person.load === "high" || person.load === "rest"
      ).length,
      availableSoonPeople: people.filter(
        (person) =>
          person.load === "low" || person.nextScheduled === "Not scheduled"
      ).length,
    },
    monthDays,
    matrixDays: getServiceMatrixDays(monthDays),
    progress: {
      rosterPeopleCount: roster.people.length,
      requestedPeopleCount: Math.min(
        requestedPeopleCount,
        roster.people.length
      ),
      hydratedPeopleCount: people.length,
    },
  };
};
