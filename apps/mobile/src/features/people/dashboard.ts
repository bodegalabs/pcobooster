/**
 * The People dashboard's rules: which people a scope covers, how their activity loads in
 * batches, and how search and coverage read. A port of the web's `lib/people-dashboard.ts` and
 * the Swift `PeopleScreens` copy. It stays in the app because `@pcobooster/contracts` depends on
 * `@pcobooster/planning-center-models`, so the shared models package cannot hold rules typed by
 * the dashboard contracts.
 */
import type {
  Activity,
  DashboardMonth,
  DashboardPerson,
  MonthDay,
  Roster,
  RosterPerson,
  RosterTeam,
} from "./types";

/** People whose schedules load without asking in a large scope; "Load more" adds as many. */
export const PEOPLE_DASHBOARD_SAMPLE_SIZE = 48;
/** A team scope loads whole up to this many people, so its health covers everyone. */
export const PEOPLE_DASHBOARD_TEAM_SCOPE_LIMIT = 160;
/**
 * Activity calls in flight at once. Each costs about 20 Planning Center requests cold, and the
 * person's budget is 100 per 20 seconds.
 */
export const PEOPLE_DASHBOARD_BATCH_CONCURRENCY = 2;
/** A search loads its unloaded matches once typing pauses this long. */
export const SEARCH_LOAD_DELAY_MS = 400;

/** " · ", between facts. */
export const SEPARATOR = " · ";

/** The teams the viewer leads, every team, or one team by id. */
export type PeopleScope = "mine" | "all" | `team:${string}`;

const TEAM_SCOPE_PREFIX = "team:";

export const teamScope = (teamId: string): PeopleScope =>
  `${TEAM_SCOPE_PREFIX}${teamId}`;

/** The scope a leader lands on: their own teams when they lead any. */
export const defaultScope = (
  roster: Pick<Roster, "ledTeamIds">
): PeopleScope => (roster.ledTeamIds.length > 0 ? "mine" : "all");

/** The teams a scope covers; null for all teams. */
export const scopeTeamIds = (
  scope: PeopleScope,
  ledTeamIds: readonly string[]
): readonly string[] | null => {
  if (scope === "all") {
    return null;
  }
  return scope === "mine"
    ? ledTeamIds
    : [scope.slice(TEAM_SCOPE_PREFIX.length)];
};

/**
 * Whether a remembered scope still names something on the roster. A team that was removed, or
 * "Teams I lead" for someone who no longer leads any, falls back to the default.
 */
export const isScopeValid = (
  scope: PeopleScope,
  roster: Pick<Roster, "ledTeamIds" | "teams">
): boolean => {
  if (scope === "all") {
    return true;
  }
  if (scope === "mine") {
    return roster.ledTeamIds.length > 0;
  }
  const teamId = scope.slice(TEAM_SCOPE_PREFIX.length);
  return roster.teams.some((team) => team.id === teamId);
};

/** The viewer's choice when it still fits the roster, else the roster's default. */
export const effectiveScope = (
  choice: PeopleScope | null,
  roster: Roster | undefined
): PeopleScope => {
  if (roster === undefined) {
    return choice ?? "all";
  }
  return choice !== null && isScopeValid(choice, roster)
    ? choice
    : defaultScope(roster);
};

/** The scope's people, in roster order (by last name). */
export const resolveScopePersonIds = (
  roster: Roster,
  scope: PeopleScope
): string[] => {
  const teamIds = scopeTeamIds(scope, roster.ledTeamIds);
  if (teamIds === null) {
    return roster.people.map((person) => person.id);
  }
  const wanted = new Set(teamIds);
  const inScope = new Set(
    roster.teams.flatMap((team) => (wanted.has(team.id) ? team.personIds : []))
  );
  return roster.people.flatMap((person) =>
    inScope.has(person.id) ? [person.id] : []
  );
};

/** How many of a scope's people load before the viewer asks for more. */
export const initialScopeLoadCount = (
  scope: PeopleScope,
  scopePeopleCount: number
): number =>
  scope !== "all" && scopePeopleCount <= PEOPLE_DASHBOARD_TEAM_SCOPE_LIMIT
    ? scopePeopleCount
    : PEOPLE_DASHBOARD_SAMPLE_SIZE;

/** People the dashboard covers: the first load plus each "Load more", within the scope. */
export const sampleSize = (
  scope: PeopleScope,
  scopePeopleCount: number,
  extraPeopleCount: number
): number =>
  Math.min(
    scopePeopleCount,
    initialScopeLoadCount(scope, scopePeopleCount) + extraPeopleCount
  );

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
export const planBatches = (
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
  sampleBatches: readonly (readonly string[])[],
  searchBatches: readonly (readonly string[])[],
  hasStarted: (personIds: readonly string[]) => boolean
): (readonly string[])[] => [
  ...sampleBatches.filter(hasStarted),
  ...searchBatches,
  ...sampleBatches.filter((personIds) => !hasStarted(personIds)),
];

/** Lowercased and trimmed; empty means no search. */
export const normalizeQuery = (query: string): string =>
  query.trim().toLowerCase();

/** One scope person, with their activity once it has loaded. */
export interface PeopleRow {
  readonly person: RosterPerson;
  /** Null until their activity loads. */
  readonly member: DashboardPerson | null;
  /** Their activity was asked for and has not answered or failed. */
  readonly loading: boolean;
}

/** Whether a row matches a normalized search by name, team, or role. */
export const matchesQuery = (
  row: Pick<PeopleRow, "person" | "member">,
  normalizedQuery: string
): boolean =>
  normalizedQuery === "" ||
  [row.person.name, ...row.person.teams, ...(row.member?.roles ?? [])]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);

/** Search matches whose activity nobody has asked for yet, in roster order. */
export const unrequestedMatchIds = (
  rows: readonly PeopleRow[],
  normalizedQuery: string,
  requestedIds: ReadonlySet<string>
): string[] =>
  normalizedQuery === ""
    ? []
    : rows.flatMap((row) =>
        row.member === null &&
        !requestedIds.has(row.person.id) &&
        matchesQuery(row, normalizedQuery)
          ? [row.person.id]
          : []
      );

/** A roster person merged with their activity. */
export const toDashboardPerson = (
  person: RosterPerson,
  activity: Activity
): DashboardPerson => ({
  ...person,
  rhythm: activity.rhythm,
  roles: activity.roles,
  monthDays: activity.monthDays,
});

/** How much of the scope the dashboard covers. */
export interface PeopleCoverage {
  /** People in the selected scope. */
  readonly scopePeopleCount: number;
  /** The first people of the scope, in roster order, the dashboard covers. */
  readonly samplePeopleCount: number;
  /** Sample people whose activity has loaded. */
  readonly loadedPeopleCount: number;
}

/** The dashboard assembled from the roster and the activity answered so far. */
export interface PeopleDashboard {
  readonly month: DashboardMonth;
  readonly teams: readonly RosterTeam[];
  readonly ledTeamIds: readonly string[];
  /** Every scope person, in roster order. */
  readonly scopeRows: readonly PeopleRow[];
  /** The first `coverage.samplePeopleCount` scope rows. */
  readonly sampleRows: readonly PeopleRow[];
  /** Sample people with activity loaded, in roster order: what health covers. */
  readonly members: readonly DashboardPerson[];
  readonly coverage: PeopleCoverage;
}

/** The scope's rows as far as activity has loaded. */
export const assembleDashboard = (
  roster: Roster,
  activities: readonly Activity[],
  {
    scopePersonIds,
    sampleCount,
    loadingPersonIds,
  }: {
    readonly scopePersonIds: readonly string[];
    readonly sampleCount: number;
    readonly loadingPersonIds: ReadonlySet<string>;
  }
): PeopleDashboard => {
  const activityById = new Map(
    activities.map((activity) => [activity.id, activity])
  );
  const personById = new Map(
    roster.people.map((person) => [person.id, person])
  );
  const scopeRows = scopePersonIds.flatMap((personId): PeopleRow[] => {
    const person = personById.get(personId);
    if (person === undefined) {
      return [];
    }
    const activity = activityById.get(personId);
    return [
      {
        person,
        member:
          activity === undefined ? null : toDashboardPerson(person, activity),
        loading: activity === undefined && loadingPersonIds.has(personId),
      },
    ];
  });
  const sampleRows = scopeRows.slice(0, Math.max(0, sampleCount));
  const members = sampleRows.flatMap(({ member }) =>
    member === null ? [] : [member]
  );
  return {
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

/** "1 person" or "3 people". */
export const peopleCount = (count: number): string =>
  `${count} ${count === 1 ? "person" : "people"}`;

/** "Band · Sunday Gathering": same-named teams told apart by their service type. */
export const teamLabel = (team: RosterTeam): string =>
  team.serviceTypeName === null
    ? team.name
    : `${team.name}${SEPARATOR}${team.serviceTypeName}`;

/** "All teams", the one team's label, or "Teams you lead". */
export const describeScope = (
  scope: PeopleScope,
  teams: readonly RosterTeam[],
  ledTeamIds: readonly string[]
): string => {
  const teamIds = scopeTeamIds(scope, ledTeamIds);
  if (teamIds === null) {
    return "All teams";
  }
  const [only] = teamIds;
  const team =
    teamIds.length === 1
      ? teams.find((candidate) => candidate.id === only)
      : undefined;
  return team === undefined ? "Teams you lead" : teamLabel(team);
};

/** The group for teams without a service type, always last. */
export const OTHER_TEAMS = "Other teams";

export interface TeamGroup {
  /** The service type's name, or "Other teams". */
  readonly serviceType: string;
  /** In roster order. */
  readonly teams: readonly RosterTeam[];
}

/** Teams grouped by service type, groups by name with "Other teams" last. */
export const groupTeams = (teams: readonly RosterTeam[]): TeamGroup[] => {
  const groups = new Map<string, RosterTeam[]>();
  for (const team of teams) {
    const key = team.serviceTypeName ?? OTHER_TEAMS;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [team]);
    } else {
      group.push(team);
    }
  }
  return [...groups.entries()]
    .map(([serviceType, grouped]) => ({ serviceType, teams: grouped }))
    .toSorted((a, b) => {
      if (a.serviceType === OTHER_TEAMS || b.serviceType === OTHER_TEAMS) {
        return (
          Number(a.serviceType === OTHER_TEAMS) -
          Number(b.serviceType === OTHER_TEAMS)
        );
      }
      return a.serviceType.localeCompare(b.serviceType);
    });
};

/**
 * "Based on 16 of 40 people so far" while the dashboard covers part of the scope; null once it
 * covers everyone.
 */
export const describeCoverage = (
  { scopePeopleCount, samplePeopleCount, loadedPeopleCount }: PeopleCoverage,
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

/** The activity line above the list; null when nothing is loading or failed. */
export type ActivityProgress =
  | { readonly kind: "failed"; readonly text: string }
  | { readonly kind: "loading"; readonly text: string };

export const describeProgress = (
  coverage: PeopleCoverage | undefined,
  isLoadingActivity: boolean,
  failedBatchCount: number
): ActivityProgress | null => {
  if (
    coverage === undefined ||
    (!isLoadingActivity && failedBatchCount === 0)
  ) {
    return null;
  }
  if (failedBatchCount > 0) {
    return { kind: "failed", text: "Some schedules failed to load." };
  }
  if (coverage.loadedPeopleCount >= coverage.samplePeopleCount) {
    return { kind: "loading", text: "Loading schedules" };
  }
  return {
    kind: "loading",
    text: `Loading schedules${SEPARATOR}${coverage.loadedPeopleCount} of ${peopleCount(coverage.samplePeopleCount)}`,
  };
};

/** "1 match" or "12 matches, 4 not loaded yet"; null without matches. */
export const searchFooter = (
  matchCount: number,
  unrequestedMatchCount: number
): string | null => {
  if (matchCount === 0) {
    return null;
  }
  const matches = matchCount === 1 ? "1 match" : `${matchCount} matches`;
  return unrequestedMatchCount > 0
    ? `${matches}, ${unrequestedMatchCount} not loaded yet`
    : matches;
};

/** "The first 48 of 230 people, by last name"; null when the sample is the whole scope. */
export const sampleFooter = (
  coverage: PeopleCoverage | undefined
): string | null =>
  coverage === undefined ||
  coverage.samplePeopleCount >= coverage.scopePeopleCount
    ? null
    : `The first ${coverage.samplePeopleCount} of ${peopleCount(coverage.scopePeopleCount)}, by last name`;

/** "Band, Vocals · Keys": a person's teams, then their roles once loaded. */
export const describeRoles = (
  person: RosterPerson,
  member: DashboardPerson | null
): string => {
  const teams = person.teams.join(", ");
  if (member === null || member.roles.length === 0) {
    return teams;
  }
  const roles = member.roles.join(", ");
  return teams === "" ? roles : `${teams}${SEPARATOR}${roles}`;
};

/** Roster orders: names A to Z (by last name), longest since serving, busiest. */
export type RosterSort = "name" | "lastServed" | "served90";

export const rosterSortLabels: Record<RosterSort, string> = {
  name: "Name",
  lastServed: "Last served",
  served90: "Served, 90 days",
};

/** Rows in a sort's order. People still loading keep roster order below everyone loaded. */
export const sortRows = (
  rows: readonly PeopleRow[],
  sort: RosterSort
): readonly PeopleRow[] => {
  if (sort === "name") {
    return rows;
  }
  return rows.toSorted((a, b) => {
    if (a.member === null || b.member === null) {
      return Number(a.member === null) - Number(b.member === null);
    }
    if (sort === "served90") {
      return b.member.rhythm.servedDays90 - a.member.rhythm.servedDays90;
    }
    // People who have not served sort first, then the longest since serving.
    return (a.member.rhythm.lastServedOn ?? "").localeCompare(
      b.member.rhythm.lastServedOn ?? ""
    );
  });
};

/** `YYYY-MM` for a dashboard month. */
export const monthKey = (
  month: Pick<DashboardMonth, "year" | "monthIndex">
): string => `${month.year}-${String(month.monthIndex + 1).padStart(2, "0")}`;

/** The day of the month of org day `todayKey` when it falls in `month`; null otherwise. */
export const todayInMonth = (
  todayKey: string,
  month: DashboardMonth
): number | null =>
  todayKey.startsWith(`${monthKey(month)}-`) ? Number(todayKey.slice(8)) : null;

const isConfirmed = (status: string | undefined): boolean => {
  const raw = (status ?? "").trim();
  return raw === "C" || raw.toLowerCase() === "confirmed";
};

/** How many people serve and rehearse on one day of the month. */
export interface MonthDayCount {
  readonly day: number;
  readonly serviceCount: number;
  readonly pendingServiceCount: number;
  readonly rehearsalCount: number;
}

/** A person scheduled on a day, with the commitment the day shows for them. */
export interface DayPerson {
  readonly person: DashboardPerson;
  readonly entry: MonthDay;
}

/** The commitment a day shows for someone: a service before a rehearsal. */
const pickEntry = (entries: readonly MonthDay[]): MonthDay | undefined =>
  entries.find((entry) => entry.kind === "service") ?? entries[0];

/** The month's days that anyone serves or rehearses on, with who and how many, in day order. */
export const scheduledDays = (
  people: readonly DashboardPerson[]
): {
  readonly count: MonthDayCount;
  readonly people: readonly DayPerson[];
}[] => {
  const days = new Set(
    people.flatMap((person) => person.monthDays.map((entry) => entry.day))
  );
  return [...days]
    .toSorted((a, b) => a - b)
    .map((day) => {
      const scheduled = people.flatMap((person): DayPerson[] => {
        const entry = pickEntry(
          person.monthDays.filter((candidate) => candidate.day === day)
        );
        return entry === undefined ? [] : [{ person, entry }];
      });
      const serving = scheduled.filter(({ entry }) => entry.kind === "service");
      return {
        count: {
          day,
          serviceCount: serving.length,
          pendingServiceCount: serving.filter(
            ({ entry }) => !isConfirmed(entry.status)
          ).length,
          rehearsalCount: scheduled.length - serving.length,
        },
        // Services before rehearsals, otherwise in the people's order.
        people: [
          ...serving,
          ...scheduled.filter(({ entry }) => entry.kind !== "service"),
        ],
      };
    });
};

/** "5 serving · 2 pending · 3 at rehearsal". */
export const describeDayCount = (count: MonthDayCount): string => {
  const parts: string[] = [];
  if (count.serviceCount > 0) {
    parts.push(`${count.serviceCount} serving`);
  }
  if (count.pendingServiceCount > 0) {
    parts.push(`${count.pendingServiceCount} pending`);
  }
  if (count.rehearsalCount > 0) {
    parts.push(`${count.rehearsalCount} at rehearsal`);
  }
  return parts.join(SEPARATOR);
};
