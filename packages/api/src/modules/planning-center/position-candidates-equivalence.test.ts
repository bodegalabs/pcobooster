import { getCandidateDetails } from "@pcobooster/api/modules/planning-center/get-candidate-details";
import type { CandidateDetail } from "@pcobooster/api/modules/planning-center/get-candidate-details";
import { getPeopleForPosition } from "@pcobooster/api/modules/planning-center/get-people-for-position";
import { getPlanWindowHistory } from "@pcobooster/api/modules/planning-center/get-plan-window-history";
import { getPositionCandidates } from "@pcobooster/api/modules/planning-center/get-position-candidates";
import { PlanningCenterAccounting } from "@pcobooster/api/planning-center/accounting";
import { PlanningCenterRequestAccounting } from "@pcobooster/api/planning-center/request-accounting";
import {
  assemblePositionCandidates,
  EMPTY_CANDIDATE_HISTORY,
} from "@pcobooster/planning-center-models/position-candidates";
import type { CandidateHistory } from "@pcobooster/planning-center-models/position-candidates";
import type {
  PCResource,
  PersonWithAvailability,
} from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

/**
 * The progressive candidate list (candidates, plan-window history in batches, candidate details
 * in batches, assembled in the browser) must equal what `people.list` returned in one call.
 */

const ORG_TIME_ZONE = "America/Los_Angeles";
/** Sunday September 27, 2026, 10:00 in Los Angeles. */
const PLAN_DATE = "2026-09-27T17:00:00.000Z";
const SERVICE_TYPE_ID = "st-sun";
const YOUTH_SERVICE_TYPE_ID = "st-youth";
const PLAN_ID = "plan-sel";
const TEAM_ID = "team-band";
const POSITION_ID = "pos-guitar";

const ref = (type: string, id: string) => ({ data: { type, id } });
const refs = (type: string, ids: string[]) => ({
  data: ids.map((id) => ({ type, id })),
});

const personResource = (
  id: string,
  first: string,
  last: string,
  archivedAt: string | null = null
): PCResource => ({
  type: "Person",
  id,
  attributes: {
    first_name: first,
    last_name: last,
    photo_url: `https://example.test/${id}.jpg`,
    photo_thumbnail_url: `https://example.test/${id}-thumb.jpg`,
    archived_at: archivedAt,
  },
});

const PEOPLE = {
  ana: personResource("p-ana", "Ana", "Alvarez"),
  ben: personResource("p-ben", "Ben", "Brooks"),
  cy: personResource("p-cy", "Cy", "Chen"),
  dee: personResource("p-dee", "Dee", "Diaz"),
  eve: personResource("p-eve", "Eve", "Evans"),
  fay: personResource("p-fay", "Fay", "Ford", "2025-01-01T00:00:00Z"),
  gus: personResource("p-gus", "Gus", "Gray"),
  hal: personResource("p-hal", "Hal", "Hill"),
  ivy: personResource("p-ivy", "Ivy", "Irwin"),
};

const teams: PCResource[] = [
  {
    type: "Team",
    id: TEAM_ID,
    attributes: { name: "Band", rehearsal_team: false },
  },
  {
    type: "Team",
    id: "team-vox",
    attributes: { name: "Vocals", rehearsal_team: false },
  },
];

const serviceTypes: PCResource[] = [
  {
    type: "ServiceType",
    id: SERVICE_TYPE_ID,
    attributes: { archived_at: null, name: "Sunday" },
  },
  {
    type: "ServiceType",
    id: YOUTH_SERVICE_TYPE_ID,
    attributes: { archived_at: null, name: "Youth" },
  },
  {
    type: "ServiceType",
    id: "st-archived",
    attributes: { archived_at: "2024-01-01T00:00:00Z", name: "Old" },
  },
];

const planTime = (
  id: string,
  planId: string,
  startsAt: string,
  timeType: "service" | "rehearsal" | "other"
): PCResource => ({
  type: "PlanTime",
  id,
  attributes: { starts_at: startsAt, ends_at: startsAt, time_type: timeType },
  relationships: { plan: ref("Plan", planId) },
});

interface PlanFixture {
  id: string;
  serviceTypeId: string;
  sortDate: string;
  times: PCResource[];
  planPeopleCount?: number;
}

const planResource = ({
  id,
  serviceTypeId,
  sortDate,
  times,
  planPeopleCount,
}: PlanFixture): PCResource => ({
  type: "Plan",
  id,
  attributes: {
    title: `Plan ${id}`,
    sort_date: sortDate,
    ...(planPeopleCount === undefined
      ? undefined
      : { plan_people_count: planPeopleCount }),
  },
  relationships: {
    service_type: ref("ServiceType", serviceTypeId),
    plan_times: refs(
      "PlanTime",
      times.map(({ id: timeId }) => timeId)
    ),
  },
});

const PLANS: PlanFixture[] = [
  {
    id: "plan-aug30",
    serviceTypeId: SERVICE_TYPE_ID,
    sortDate: "2026-08-30T17:00:00Z",
    times: [
      planTime("t-aug30", "plan-aug30", "2026-08-30T17:00:00Z", "service"),
    ],
  },
  {
    id: "plan-sep13",
    serviceTypeId: SERVICE_TYPE_ID,
    sortDate: "2026-09-13T17:00:00Z",
    times: [
      planTime("t-sep13", "plan-sep13", "2026-09-13T17:00:00Z", "service"),
      // Thursday 7 pm in Los Angeles, already Friday in UTC.
      planTime(
        "t-sep10-reh",
        "plan-sep13",
        "2026-09-11T02:00:00Z",
        "rehearsal"
      ),
    ],
  },
  {
    id: PLAN_ID,
    serviceTypeId: SERVICE_TYPE_ID,
    sortDate: PLAN_DATE,
    times: [
      planTime("t-sel", PLAN_ID, PLAN_DATE, "service"),
      planTime("t-sel-reh", PLAN_ID, "2026-09-26T01:00:00Z", "rehearsal"),
    ],
  },
  {
    id: "plan-oct11",
    serviceTypeId: SERVICE_TYPE_ID,
    sortDate: "2026-10-11T17:00:00Z",
    times: [
      planTime("t-oct11", "plan-oct11", "2026-10-11T17:00:00Z", "service"),
    ],
  },
  {
    id: "plan-oct18-empty",
    serviceTypeId: SERVICE_TYPE_ID,
    sortDate: "2026-10-18T17:00:00Z",
    times: [],
    planPeopleCount: 0,
  },
  {
    id: "plan-y-sep25",
    serviceTypeId: YOUTH_SERVICE_TYPE_ID,
    // Friday 7 pm in Los Angeles; the UTC date is already the 26th.
    sortDate: "2026-09-26T02:00:00Z",
    times: [
      planTime("t-y-sep25", "plan-y-sep25", "2026-09-26T02:00:00Z", "service"),
    ],
  },
  {
    id: "plan-y-oct2",
    serviceTypeId: YOUTH_SERVICE_TYPE_ID,
    sortDate: "2026-10-03T02:30:00Z",
    times: [
      planTime("t-y-oct2", "plan-y-oct2", "2026-10-03T02:30:00Z", "service"),
      planTime(
        "t-y-oct2-other",
        "plan-y-oct2",
        "2026-10-03T01:00:00Z",
        "other"
      ),
    ],
  },
];

interface MemberFixture {
  id: string;
  person: PCResource;
  planId: string;
  teamId?: string;
  position: string;
  status: string;
  times?: string[];
  serviceTimes?: string[];
  declineReason?: string | null;
}

const member = ({
  id,
  person,
  planId,
  teamId = TEAM_ID,
  position,
  status,
  times,
  serviceTimes,
  declineReason = null,
}: MemberFixture): PCResource => ({
  type: "PlanPerson",
  id,
  attributes: {
    status,
    created_at: "2026-01-01T00:00:00Z",
    team_position_name: position,
    decline_reason: declineReason,
  },
  relationships: {
    person: ref("Person", person.id),
    plan: ref("Plan", planId),
    team: ref("Team", teamId),
    ...(times === undefined ? undefined : { times: refs("PlanTime", times) }),
    ...(serviceTimes === undefined
      ? undefined
      : { service_times: refs("PlanTime", serviceTimes) }),
  },
});

const selectedRoster = [
  member({
    id: "pp-ana-sel",
    person: PEOPLE.ana,
    planId: PLAN_ID,
    position: "Electric Guitar",
    status: "C",
    times: ["t-sel", "t-sel-reh"],
    serviceTimes: ["t-sel"],
  }),
  member({
    id: "pp-ben-sel",
    person: PEOPLE.ben,
    planId: PLAN_ID,
    position: "Electric Guitar",
    status: "U",
  }),
  member({
    id: "pp-cy-sel",
    person: PEOPLE.cy,
    planId: PLAN_ID,
    position: "Band - Electric Guitar",
    status: "D",
    declineReason: "  Out of town  ",
  }),
  member({
    id: "pp-dee-sel",
    person: PEOPLE.dee,
    planId: PLAN_ID,
    teamId: "team-vox",
    position: "Harmony",
    status: "U",
  }),
  member({
    id: "pp-eve-sel",
    person: PEOPLE.eve,
    planId: PLAN_ID,
    position: "Keys",
    status: "Declined",
  }),
  member({
    id: "pp-hal-sel",
    person: PEOPLE.hal,
    planId: PLAN_ID,
    position: "Electric Guitar",
    status: "U",
  }),
];

/**
 * The window's copy of the selected roster lags the fresh read: Gus was on the slot a minute
 * ago. The single call merged both copies, so the progressive list must too.
 */
const windowSelectedRoster = [
  ...selectedRoster,
  member({
    id: "pp-gus-sel",
    person: PEOPLE.gus,
    planId: PLAN_ID,
    position: "Band - Electric Guitar",
    status: "U",
  }),
];

const windowRosters = new Map(
  Object.entries({
    "plan-aug30": [
      member({
        id: "pp-ana-aug30",
        person: PEOPLE.ana,
        planId: "plan-aug30",
        position: "Electric Guitar",
        status: "C",
        times: ["t-aug30"],
        serviceTimes: ["t-aug30"],
      }),
      member({
        id: "pp-ben-aug30",
        person: PEOPLE.ben,
        planId: "plan-aug30",
        position: "Electric Guitar",
        status: "D",
      }),
      member({
        id: "pp-gus-aug30",
        person: PEOPLE.gus,
        planId: "plan-aug30",
        position: "Electric Guitar",
        status: "U",
      }),
    ],
    "plan-sep13": [
      member({
        id: "pp-ana-sep13",
        person: PEOPLE.ana,
        planId: "plan-sep13",
        position: "Electric Guitar",
        status: "C",
        times: ["t-sep13", "t-sep10-reh"],
        serviceTimes: ["t-sep13"],
      }),
      member({
        id: "pp-dee-sep13",
        person: PEOPLE.dee,
        planId: "plan-sep13",
        teamId: "team-vox",
        position: "Harmony",
        status: "C",
        times: ["t-sep10-reh"],
        serviceTimes: [],
      }),
    ],
    [PLAN_ID]: windowSelectedRoster,
    "plan-oct11": [
      member({
        id: "pp-gus-oct11",
        person: PEOPLE.gus,
        planId: "plan-oct11",
        position: "Electric Guitar",
        status: "C",
      }),
      member({
        id: "pp-cy-oct11",
        person: PEOPLE.cy,
        planId: "plan-oct11",
        position: "Electric Guitar",
        status: "U",
        times: ["t-oct11"],
        serviceTimes: ["t-oct11"],
      }),
    ],
    "plan-y-sep25": [
      member({
        id: "pp-ben-ysep25",
        person: PEOPLE.ben,
        planId: "plan-y-sep25",
        position: "Band - Bass",
        status: "C",
      }),
      member({
        id: "pp-eve-ysep25",
        person: PEOPLE.eve,
        planId: "plan-y-sep25",
        position: "Keys",
        status: "U",
      }),
    ],
    "plan-y-oct2": [
      member({
        id: "pp-ana-yoct2",
        person: PEOPLE.ana,
        planId: "plan-y-oct2",
        position: "Electric Guitar",
        status: "U",
        times: ["t-y-oct2-other"],
        serviceTimes: [],
      }),
      member({
        id: "pp-ivy-yoct2",
        person: PEOPLE.ivy,
        planId: "plan-y-oct2",
        position: "Electric Guitar",
        status: "C",
        times: ["t-y-oct2"],
        serviceTimes: ["t-y-oct2"],
      }),
    ],
  })
);

const rosterIncluded = (planId: string): PCResource[] => {
  const plan = PLANS.find(({ id }) => id === planId);
  return [
    ...Object.values(PEOPLE),
    ...teams,
    ...(plan === undefined ? [] : [planResource(plan)]),
  ];
};

const laBlockout = (
  id: string,
  startsAt: string,
  endsAt: string,
  extra: Record<string, string> = {}
): PCResource => ({
  type: "Blockout",
  id,
  attributes: {
    reason: "Away",
    description: "",
    share: true,
    starts_at: startsAt,
    ends_at: endsAt,
    time_zone: ORG_TIME_ZONE,
    repeat_frequency: "no_repeat",
    ...extra,
  },
});

const weekly = { repeat_frequency: "every_1", repeat_period: "weekly" };

const blockoutsByPerson = new Map(
  Object.entries({
    // All of Saturday in Los Angeles; in UTC it runs into Sunday the 27th.
    "p-ben": [
      laBlockout("b-ben-sat", "2026-09-26T07:00:00Z", "2026-09-27T06:59:59Z"),
    ],
    // All of Sunday the 27th in Los Angeles.
    "p-gus": [
      laBlockout("b-gus-sun", "2026-09-27T07:00:00Z", "2026-09-28T06:59:59Z"),
    ],
    "p-dee": [
      laBlockout(
        "b-dee-weekly",
        "2026-01-04T08:00:00Z",
        "2026-01-05T07:59:59Z",
        weekly
      ),
    ],
    "p-eve": [
      laBlockout(
        "b-eve-ended",
        "2026-01-04T08:00:00Z",
        "2026-01-05T07:59:59Z",
        {
          ...weekly,
          repeat_until: "2026-03-01",
        }
      ),
    ],
    // Monday the 28th in Tokyo, which is when the plan starts there.
    "p-hal": [
      {
        type: "Blockout",
        id: "b-hal-tokyo",
        attributes: {
          reason: "Travel",
          description: "",
          share: false,
          starts_at: "2026-09-27T15:00:00Z",
          ends_at: "2026-09-28T14:59:59Z",
          time_zone: "Asia/Tokyo",
          repeat_frequency: "no_repeat",
        },
      },
    ],
  })
);

const blockoutDates = new Map(
  Object.entries({
    "b-dee-weekly": [
      laBlockout("d-dee-sep20", "2026-09-20T07:00:00Z", "2026-09-21T06:59:59Z"),
      laBlockout("d-dee-sep27", "2026-09-27T07:00:00Z", "2026-09-28T06:59:59Z"),
    ],
  })
);

const schedule = (params: {
  id: string;
  planId: string;
  status: string;
  position: string;
  teamName?: string;
  sortDate: string;
  planTimes?: string[];
  times?: string[];
  planPersonId?: string;
  declineReason?: string;
}): PCResource => ({
  type: "Schedule",
  id: params.id,
  attributes: {
    status: params.status,
    sort_date: params.sortDate,
    team_position_name: params.position,
    service_type_name: "Sunday",
    ...(params.teamName === undefined
      ? undefined
      : { team_name: params.teamName }),
    ...(params.declineReason === undefined
      ? undefined
      : { decline_reason: params.declineReason }),
  },
  relationships: {
    plan: ref("Plan", params.planId),
    team: ref("Team", TEAM_ID),
    ...(params.planPersonId === undefined
      ? undefined
      : { plan_person: ref("PlanPerson", params.planPersonId) }),
    ...(params.planTimes === undefined
      ? undefined
      : { plan_times: refs("PlanTime", params.planTimes) }),
    ...(params.times === undefined
      ? undefined
      : { times: refs("PlanTime", params.times) }),
  },
});

const schedulesByPerson = new Map(
  Object.entries({
    "p-ana": [
      schedule({
        id: "s-ana-sep13",
        planId: "plan-sep13",
        status: "C",
        position: "Electric Guitar",
        teamName: "Band",
        sortDate: "2026-09-13T17:00:00Z",
        planTimes: ["t-sep13"],
        times: ["t-sep13", "t-sep10-reh"],
      }),
      schedule({
        id: "s-ana-sel",
        planId: PLAN_ID,
        status: "C",
        position: "Electric Guitar",
        teamName: "Band",
        sortDate: PLAN_DATE,
        planTimes: ["t-sel"],
        planPersonId: "pp-ana-sel",
      }),
    ],
    "p-gus": [
      schedule({
        id: "s-gus-sel",
        planId: PLAN_ID,
        status: "U",
        position: "Electric Guitar",
        teamName: "Band",
        sortDate: PLAN_DATE,
        planPersonId: "pp-gus-sel",
      }),
    ],
    "p-cy": [
      schedule({
        id: "s-cy-sel",
        planId: PLAN_ID,
        status: "D",
        position: "Band - Electric Guitar",
        sortDate: PLAN_DATE,
        planPersonId: "pp-cy-sel",
        declineReason: "Out of town",
      }),
      schedule({
        id: "s-cy-oct11",
        planId: "plan-oct11",
        status: "U",
        position: "Electric Guitar",
        sortDate: "2026-10-11T17:00:00Z",
      }),
    ],
    "p-dee": [
      schedule({
        id: "s-dee-sep13",
        planId: "plan-sep13",
        status: "C",
        position: "Harmony",
        teamName: "Vocals",
        sortDate: "2026-09-13T17:00:00Z",
        times: ["t-sep10-reh"],
      }),
    ],
  })
);

const scheduleIncluded: PCResource[] = PLANS.flatMap((plan) => [
  planResource(plan),
  ...plan.times,
]);

interface OrgFixture {
  /** Plan ranges come back empty, so history falls back to people's own schedules. */
  readonly emptyWindow?: boolean;
}

const createOrg = ({ emptyWindow = false }: OrgFixture = {}) => {
  const cacheScope = `equivalence-${crypto.randomUUID()}`;
  const catalog = {
    getServiceTypesCached: () => Effect.succeed(structuredClone(serviceTypes)),
  };
  const plans = {
    getPlansWithIncludedInDateRange: (serviceTypeId: string) => {
      const inRange = emptyWindow
        ? []
        : PLANS.filter((plan) => plan.serviceTypeId === serviceTypeId);
      return Effect.succeed({
        data: inRange.map(planResource),
        included: inRange.flatMap(({ times }) => times),
      });
    },
  };
  const people = {
    getCacheScope: () => cacheScope,
    getPeopleForTeamPosition: () =>
      Effect.succeed({
        data: ["ana", "ben", "cy", "dee", "eve", "fay", "gus"].map((key) => ({
          type: "PersonTeamPositionAssignment",
          id: `a-${key}`,
          attributes: {},
          relationships: { person: ref("Person", `p-${key}`) },
        })),
        included: [
          ...Object.values(PEOPLE),
          {
            type: "TeamPosition",
            id: POSITION_ID,
            attributes: { name: "Electric Guitar" },
          },
          ...teams,
        ],
      }),
    getPlanTeamMembers: (
      _serviceTypeId: string,
      planId: string,
      options?: { readonly settled?: boolean }
    ) => {
      // Only the window passes options; the fresh selected-plan read does not.
      const members =
        options === undefined && planId === PLAN_ID
          ? selectedRoster
          : (windowRosters.get(planId) ?? []);
      return Effect.succeed({
        data: structuredClone(members),
        included: rosterIncluded(planId),
      });
    },
    getPersonBlockouts: (personId: string) =>
      Effect.succeed(structuredClone(blockoutsByPerson.get(personId) ?? [])),
    getPersonBlockoutDates: (_personId: string, blockoutId: string) =>
      Effect.succeed(structuredClone(blockoutDates.get(blockoutId) ?? [])),
    getPersonSchedules: (personId: string) =>
      Effect.succeed({
        data: structuredClone(schedulesByPerson.get(personId) ?? []),
        included: scheduleIncluded,
      }),
  };
  return {
    catalog,
    people,
    plans,
    resolveTimeZone: Effect.succeed(ORG_TIME_ZONE),
  };
};

type Org = ReturnType<typeof createOrg>;

const input = {
  serviceTypeId: SERVICE_TYPE_ID,
  positionId: POSITION_ID,
  teamId: TEAM_ID,
  planId: PLAN_ID,
  date: PLAN_DATE,
};

/** Runs one call as if transport had already counted `spent` requests. */
const runWithSpent = async <Value>(
  program: Effect.Effect<Value, unknown>,
  spent: number
): Promise<Value> => {
  const accounting = new PlanningCenterRequestAccounting();
  for (let index = 0; index < spent; index += 1) {
    accounting.recordRequest();
  }
  return await Effect.runPromise(
    program.pipe(Effect.provideService(PlanningCenterAccounting, accounting))
  );
};

const BATCH_SIZE = 16;

interface Progress {
  calls: number;
}

type HistoryContinuation = Parameters<
  typeof getPlanWindowHistory
>[0]["continuation"];

/** Follows plan-window continuations, keeping rows in call order as the browser does. */
const loadWindowHistory = async (
  org: Org,
  spent: number,
  progress: Progress,
  continuation: HistoryContinuation,
  history: Map<string, CandidateHistory>
): Promise<number> => {
  const batch = await runWithSpent(
    getPlanWindowHistory(
      { planId: PLAN_ID, date: PLAN_DATE, continuation },
      org
    ),
    spent
  );
  progress.calls += 1;
  for (const { personId, ...rows } of batch.people) {
    const existing = history.get(personId);
    history.set(personId, {
      serviceHistory: [
        ...(existing?.serviceHistory ?? []),
        ...rows.serviceHistory,
      ],
      selectedPlanAssignments: [
        ...(existing?.selectedPlanAssignments ?? []),
        ...rows.selectedPlanAssignments,
      ],
    });
  }
  if (
    batch.deferredPlans.length === 0 &&
    batch.deferredServiceTypeIds.length === 0
  ) {
    return batch.loadedPlanCount;
  }
  return (
    batch.loadedPlanCount +
    (await loadWindowHistory(
      org,
      spent,
      progress,
      {
        plans: batch.deferredPlans,
        serviceTypeIds: batch.deferredServiceTypeIds,
      },
      history
    ))
  );
};

/** Follows `deferredPersonIds` for one batch of candidates. */
const loadDetails = async (
  org: Org,
  spent: number,
  progress: Progress,
  personIds: string[],
  scheduleHistory: boolean
): Promise<CandidateDetail[]> => {
  if (personIds.length === 0) {
    return [];
  }
  const batch = await runWithSpent(
    getCandidateDetails(
      { personIds, planId: PLAN_ID, date: PLAN_DATE, scheduleHistory },
      org
    ),
    spent
  );
  progress.calls += 1;
  if (batch.deferredPersonIds.length >= personIds.length) {
    throw new Error("Candidate details made no progress");
  }
  return [
    ...batch.people,
    ...(await loadDetails(
      org,
      spent,
      progress,
      batch.deferredPersonIds,
      scheduleHistory
    )),
  ];
};

/** What the browser does, with `spent` requests already counted before every call. */
const loadProgressively = async (
  org: Org,
  spent: number
): Promise<{ people: PersonWithAvailability[]; calls: number }> => {
  const progress: Progress = { calls: 1 };
  const candidates = await Effect.runPromise(getPositionCandidates(input, org));
  const windowHistory = new Map<string, CandidateHistory>();
  const loadedPlanCount = await loadWindowHistory(
    org,
    spent,
    progress,
    undefined,
    windowHistory
  );
  const scheduleHistory = loadedPlanCount === 0;
  const candidateIds = candidates.candidates.map(({ id }) => id);
  const batches: string[][] = [];
  for (let start = 0; start < candidateIds.length; start += BATCH_SIZE) {
    batches.push(candidateIds.slice(start, start + BATCH_SIZE));
  }
  const batchDetails = await Promise.all(
    batches.map(
      async (personIds) =>
        await loadDetails(org, spent, progress, personIds, scheduleHistory)
    )
  );
  const details = new Map(
    batchDetails.flat().map((detail) => [detail.personId, detail])
  );

  const assembled = assemblePositionCandidates({
    candidates: candidates.candidates,
    match: candidates.match,
    referenceDate: new Date(PLAN_DATE),
    timeZone: candidates.timeZone,
    historyFor: (personId) =>
      scheduleHistory
        ? details.get(personId)?.history
        : (windowHistory.get(personId) ?? EMPTY_CANDIDATE_HISTORY),
    blockedFor: (personId) => details.get(personId)?.isBlockedForDate,
  });
  expect(assembled.complete).toBeTruthy();
  return { people: assembled.people, calls: progress.calls };
};

const loadInOneCall = async (org: Org) =>
  await Effect.runPromise(getPeopleForPosition(input, org));

describe("progressive candidate list equivalence", () => {
  it("matches the single call over the plan window", async () => {
    const single = await loadInOneCall(createOrg());
    const progressive = await loadProgressively(createOrg(), 0);

    expect(progressive.people).toStrictEqual(single);
    expect(progressive.calls).toBe(3);
  });

  it("matches the single call when every call is left almost no budget", async () => {
    const single = await loadInOneCall(createOrg());
    // 39 of 40 requests already spent: one roster (or one blockout date) per call.
    const progressive = await loadProgressively(createOrg(), 39);

    expect(progressive.people).toStrictEqual(single);
    expect(progressive.calls).toBeGreaterThan(6);
  });

  it("matches the single call when the window has no plans", async () => {
    const single = await loadInOneCall(createOrg({ emptyWindow: true }));
    const progressive = await loadProgressively(
      createOrg({ emptyWindow: true }),
      0
    );

    expect(progressive.people).toStrictEqual(single);
  });

  it("exercises the cases it claims to", async () => {
    const people = await loadInOneCall(createOrg());
    const byId = new Map(people.map((person) => [person.id, person]));

    expect({
      ids: people.map(({ id }) => id).toSorted(),
      ana: byId.get("p-ana"),
      ben: byId.get("p-ben"),
      cy: byId.get("p-cy"),
      dee: byId.get("p-dee")?.isBlockedForDate,
      eve: byId.get("p-eve")?.isBlockedForDate,
      gus: byId.get("p-gus"),
      hal: byId.get("p-hal")?.isBlockedForDate,
    }).toMatchObject({
      // Fay is archived; Ivy is only in history.
      ids: ["p-ana", "p-ben", "p-cy", "p-dee", "p-eve", "p-gus", "p-hal"],
      ana: {
        isConfirmedForSelectedPlanPosition: true,
        // Aug 30, Sep 13, and the plan day; rehearsals on Thursday Sep 10 and Friday Sep 25
        // (both already the next day in UTC); the youth plan with only an "other" time.
        frequency: {
          recentServedDays: 3,
          recentRehearsalOnlyDays: 2,
          upcomingServices: 1,
        },
      },
      ben: {
        isBlockedForDate: false,
        selectedPlanAssignmentLabels: [
          "Band - Electric Guitar",
          "Electric Guitar",
        ],
      },
      cy: {
        isDeclinedForSelectedPlanPosition: true,
        selectedPlanDeclineReason: "Out of town",
      },
      dee: true,
      eve: false,
      gus: {
        isBlockedForDate: true,
        isScheduledForSelectedPlanPosition: true,
        scheduledPlanPersonId: "pp-gus-sel",
      },
      hal: true,
    });
  });
});
