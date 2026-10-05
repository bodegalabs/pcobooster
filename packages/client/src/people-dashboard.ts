import type {
  PeopleDashboardActivity,
  PeopleDashboardMonth,
  PeopleDashboardMonthDay,
  PeopleDashboardPerson,
  PeopleDashboardRoster,
  PeopleDashboardRosterPerson,
  PeopleDashboardTeam,
} from "@pcobooster/contracts/people-schemas";

/** People whose schedules load without asking in the all-teams scope; more load on request. */
export const PEOPLE_DASHBOARD_SAMPLE_SIZE = 48;
/**
 * A team scope loads whole up to this many people, so its health covers
 * everyone; larger scopes load in samples like the all-teams scope.
 */
export const PEOPLE_DASHBOARD_TEAM_SCOPE_LIMIT = 160;
/**
 * Activity calls in flight at once. Each costs about 20 Planning Center
 * requests cold, and the user's budget is 100 per 20 seconds.
 */
export const PEOPLE_DASHBOARD_BATCH_CONCURRENCY = 2;
/** Service days the month matrix shows at once. */
export const MATRIX_DAY_COUNT = 5;
const DAYS_IN_LONGEST_MONTH = 31;

/** How many people serve on one day of the month. */
export interface PeopleDashboardDay {
  day: number;
  /** People serving at a service that day. */
  serviceCount: number;
  confirmedServiceCount: number;
  pendingServiceCount: number;
  /** People at a rehearsal that day. */
  rehearsalCount: number;
}

/** The teams the viewer leads, every team, or one team by id. */
export type PeopleDashboardScope = "mine" | "all" | `team:${string}`;

export type PeopleDashboardView = "health" | "month";

const TEAM_SCOPE_PREFIX = "team:";

export const teamScope = (teamId: string): PeopleDashboardScope =>
  `${TEAM_SCOPE_PREFIX}${teamId}`;

/** A select value or search param as a scope; anything unrecognized is null. */
export const parsePeopleDashboardScope = (
  value?: string
): PeopleDashboardScope | null => {
  if (value === undefined) {
    return null;
  }
  if (value === "mine" || value === "all") {
    return value;
  }
  return value.startsWith(TEAM_SCOPE_PREFIX) &&
    value.length > TEAM_SCOPE_PREFIX.length
    ? teamScope(value.slice(TEAM_SCOPE_PREFIX.length))
    : null;
};

/** A search param as a view; Health unless it says Month. */
export const parsePeopleDashboardView = (
  value?: string
): PeopleDashboardView => (value === "month" ? "month" : "health");

/** One scope person, with their activity once it has loaded. */
export interface PeopleDashboardRow {
  person: PeopleDashboardRosterPerson;
  /** Null until their activity loads. */
  member: PeopleDashboardPerson | null;
  /** Their activity is on its way. */
  loading: boolean;
}

/** How much of the scope health covers. */
export interface PeopleDashboardCoverage {
  /** People in the selected scope. */
  scopePeopleCount: number;
  /** The first people of the scope, in roster order, that health covers. */
  samplePeopleCount: number;
  /** Sample people whose activity has loaded. */
  loadedPeopleCount: number;
}

const peopleCount = (count: number) =>
  `${count} ${count === 1 ? "person" : "people"}`;

/**
 * "Based on 16 of 40 people so far" while health covers part of the scope; null once it
 * covers everyone. "The first" means the sample, in roster order, has all loaded.
 */
export const describeCoverage = (
  {
    scopePeopleCount,
    samplePeopleCount,
    loadedPeopleCount,
  }: PeopleDashboardCoverage,
  isLoading: boolean
): string | null => {
  if (loadedPeopleCount >= scopePeopleCount) {
    return null;
  }
  if (isLoading) {
    return `Based on ${loadedPeopleCount} of ${peopleCount(scopePeopleCount)} so far`;
  }
  if (loadedPeopleCount === samplePeopleCount) {
    return `Based on the first ${loadedPeopleCount} of ${peopleCount(scopePeopleCount)}`;
  }
  return `Based on ${loadedPeopleCount} of ${peopleCount(scopePeopleCount)}`;
};

/** The dashboard as the browser assembles it from the roster and activity batches. */
export interface PeopleDashboardData {
  generatedAt: string;
  month: PeopleDashboardMonth;
  /** Roster teams, available before any activity arrives. */
  teams: PeopleDashboardTeam[];
  /** Teams the viewer leads. */
  ledTeamIds: string[];
  /** Every scope person, in roster order (by last name). */
  scopeRows: PeopleDashboardRow[];
  /** The first `coverage.samplePeopleCount` scope rows. */
  sampleRows: PeopleDashboardRow[];
  /** Sample people with activity loaded, in roster order: what health covers. */
  members: PeopleDashboardPerson[];
  coverage: PeopleDashboardCoverage;
}

const isConfirmedStatus = (status: string | undefined) => {
  const raw = (status ?? "").trim();
  return raw === "C" || raw.toLowerCase() === "confirmed";
};

/** People serving and rehearsing on each day of the month. */
export const buildMonthDays = (
  people: readonly Pick<PeopleDashboardPerson, "monthDays">[]
): PeopleDashboardDay[] =>
  Array.from({ length: DAYS_IN_LONGEST_MONTH }, (_, index) => {
    const day = index + 1;
    const peopleWith = (matches: (entry: PeopleDashboardMonthDay) => boolean) =>
      people.filter((person) =>
        person.monthDays.some((entry) => entry.day === day && matches(entry))
      ).length;
    const confirmedServiceCount = peopleWith(
      (entry) => entry.kind === "service" && isConfirmedStatus(entry.status)
    );
    const serviceCount = peopleWith((entry) => entry.kind === "service");
    return {
      day,
      serviceCount,
      confirmedServiceCount,
      pendingServiceCount: serviceCount - confirmedServiceCount,
      rehearsalCount: peopleWith((entry) => entry.kind === "rehearsal"),
    };
  });

/** Days someone serves at a service, in order. */
export const serviceDays = (monthDays: readonly PeopleDashboardDay[]) =>
  monthDays.flatMap((day) => (day.serviceCount > 0 ? [day.day] : []));

/**
 * Where the page of `MATRIX_DAY_COUNT` service days starts that holds `selectedDay`, or the next
 * service day after it; the last page when no service day follows.
 */
export const matrixPageStart = (
  days: readonly number[],
  selectedDay: number
) => {
  const index = days.findIndex((day) => day >= selectedDay);
  const pageIndex = index === -1 ? Math.max(0, days.length - 1) : index;
  return Math.floor(pageIndex / MATRIX_DAY_COUNT) * MATRIX_DAY_COUNT;
};

/** The scope a leader lands on: their own teams when they lead any. */
export const defaultPeopleDashboardScope = (
  roster: Pick<PeopleDashboardRoster, "ledTeamIds">
): PeopleDashboardScope => (roster.ledTeamIds.length > 0 ? "mine" : "all");

/** The teams a team scope covers; null for all teams. */
export const scopeTeamIds = (
  scope: PeopleDashboardScope,
  ledTeamIds: readonly string[]
): readonly string[] | null => {
  if (scope === "all") {
    return null;
  }
  return scope === "mine"
    ? ledTeamIds
    : [scope.slice(TEAM_SCOPE_PREFIX.length)];
};

/** The scope's people, in roster order (by last name). */
export const resolveScopePersonIds = (
  roster: PeopleDashboardRoster,
  scope: PeopleDashboardScope
): string[] => {
  const scopedTeamIds = scopeTeamIds(scope, roster.ledTeamIds);
  if (scopedTeamIds === null) {
    return roster.people.map((person) => person.id);
  }
  const teamIds = new Set(scopedTeamIds);
  const inScope = new Set(
    roster.teams.flatMap((team) => (teamIds.has(team.id) ? team.personIds : []))
  );
  return roster.people.flatMap((person) =>
    inScope.has(person.id) ? [person.id] : []
  );
};

/** How many of a scope's people load before the viewer asks for more. */
export const initialScopeLoadCount = (
  scope: PeopleDashboardScope,
  scopePeopleCount: number
) =>
  scope !== "all" && scopePeopleCount <= PEOPLE_DASHBOARD_TEAM_SCOPE_LIMIT
    ? scopePeopleCount
    : PEOPLE_DASHBOARD_SAMPLE_SIZE;

/** `personIds` split into activity calls. */
export const chunkPersonIds = (
  personIds: readonly string[],
  batchSize: number
): string[][] => {
  const batches: string[][] = [];
  for (let start = 0; start < personIds.length; start += batchSize) {
    batches.push(personIds.slice(start, start + batchSize));
  }
  return batches;
};

/** The first `targetPeopleCount` scope people, split into activity calls. */
export const planPeopleDashboardBatches = (
  personIds: readonly string[],
  targetPeopleCount: number,
  batchSize: number
): string[][] =>
  chunkPersonIds(personIds.slice(0, Math.max(0, targetPeopleCount)), batchSize);

/**
 * The order activity calls start in, two at a time: calls already under way keep their place,
 * then search matches the viewer is waiting on, then the rest of the sample.
 */
export const orderActivityBatches = (
  sampleBatches: readonly string[][],
  searchBatches: readonly string[][],
  hasStarted: (personIds: readonly string[]) => boolean
): string[][] => [
  ...sampleBatches.filter(hasStarted),
  ...searchBatches,
  ...sampleBatches.filter((personIds) => !hasStarted(personIds)),
];

/** Lowercased and trimmed; empty means no search. */
export const normalizePeopleQuery = (query: string) =>
  query.trim().toLowerCase();

/** Whether a scope row matches a normalized search by name, team, or role. */
export const matchesPeopleQuery = (
  row: Pick<PeopleDashboardRow, "person" | "member">,
  normalizedQuery: string
) =>
  normalizedQuery === "" ||
  [row.person.name, ...row.person.teams, ...(row.member?.roles ?? [])]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);

/** Search matches whose activity nobody has asked for yet, in roster order. */
export const unrequestedMatchIds = (
  rows: readonly PeopleDashboardRow[],
  normalizedQuery: string,
  requestedIds: ReadonlySet<string>
): string[] =>
  normalizedQuery === ""
    ? []
    : rows.flatMap((row) =>
        row.member === null &&
        !requestedIds.has(row.person.id) &&
        matchesPeopleQuery(row, normalizedQuery)
          ? [row.person.id]
          : []
      );

/** A roster person merged with their activity. */
export const toDashboardPerson = (
  person: PeopleDashboardRosterPerson,
  activity: PeopleDashboardActivity
): PeopleDashboardPerson => {
  const { id: _activityId, ...serving } = activity;
  return { ...person, ...serving };
};

/**
 * The scope's rows as far as activity has loaded. Health covers the first
 * `samplePeopleCount` scope people; it grows as their batches answer.
 */
export const assemblePeopleDashboard = (
  roster: PeopleDashboardRoster,
  activities: readonly PeopleDashboardActivity[],
  {
    scopePersonIds,
    samplePeopleCount,
    loadingPersonIds,
  }: {
    scopePersonIds: readonly string[];
    samplePeopleCount: number;
    /** People whose activity was asked for and has not answered or failed. */
    loadingPersonIds: ReadonlySet<string>;
  }
): PeopleDashboardData => {
  const activityById = new Map(
    activities.map((activity) => [activity.id, activity])
  );
  const personById = new Map(
    roster.people.map((person) => [person.id, person])
  );
  const scopeRows = scopePersonIds.flatMap((personId): PeopleDashboardRow[] => {
    const person = personById.get(personId);
    if (person === undefined) {
      return [];
    }
    const activity = activityById.get(personId);
    return [
      {
        person,
        member: activity ? toDashboardPerson(person, activity) : null,
        loading: activity === undefined && loadingPersonIds.has(personId),
      },
    ];
  });
  const sampleRows = scopeRows.slice(0, Math.max(0, samplePeopleCount));
  const members = sampleRows.flatMap(({ member }) =>
    member === null ? [] : [member]
  );

  return {
    generatedAt: roster.generatedAt,
    month: roster.month,
    teams: roster.teams,
    ledTeamIds: roster.ledTeamIds,
    scopeRows,
    sampleRows,
    members,
    coverage: {
      scopePeopleCount: scopeRows.length,
      samplePeopleCount: sampleRows.length,
      loadedPeopleCount: members.length,
    },
  };
};
