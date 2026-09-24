import { getCandidateDetails } from "@pcobooster/api/modules/planning-center/get-candidate-details";
import type {
  CandidateDetail,
  CandidateDetailsBatch,
  CandidateDetailsDependencies,
  CandidateDetailsInput,
} from "@pcobooster/api/modules/planning-center/get-candidate-details";
import { PlanningCenterAccounting } from "@pcobooster/api/planning-center/accounting";
import { PlanningCenterRequestAccounting } from "@pcobooster/api/planning-center/request-accounting";
import {
  PLANNING_CENTER_REQUEST_CAP,
  PROGRESSIVE_REQUEST_BUDGET,
} from "@pcobooster/api/planning-center/request-budget";
import { countedRead } from "@pcobooster/api/testing/planning-center-requests";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

/** Sunday May 3, 2026, 10:00 UTC. */
const PLAN_DATE = "2026-05-03T10:00:00.000Z";
const PLAN_ID = "plan-selected";

const ref = (type: string, id: string) => ({ data: { type, id } });
const refs = (type: string, ids: readonly string[]) => ({
  data: ids.map((id) => ({ type, id })),
});

const planTime = (
  id: string,
  planId: string,
  startsAt: string,
  timeType: "service" | "rehearsal"
): PCResource => ({
  type: "PlanTime",
  id,
  attributes: { starts_at: startsAt, ends_at: startsAt, time_type: timeType },
  relationships: { plan: ref("Plan", planId) },
});

/** A plan `daysFromPlan` days after the selected one, with a service and a rehearsal time. */
const servedPlan = (personId: string, daysFromPlan: number) => {
  const planId = `plan-${personId}-${daysFromPlan}`;
  const serviceAt = new Date(
    Date.parse(PLAN_DATE) + daysFromPlan * 24 * 60 * 60 * 1000
  );
  const rehearsalAt = new Date(serviceAt.getTime() - 2 * 24 * 60 * 60 * 1000);
  const service = planTime(
    `${planId}-service`,
    planId,
    serviceAt.toISOString(),
    "service"
  );
  const rehearsal = planTime(
    `${planId}-rehearsal`,
    planId,
    rehearsalAt.toISOString(),
    "rehearsal"
  );
  const schedule: PCResource = {
    type: "Schedule",
    id: `schedule-${planId}`,
    attributes: {
      sort_date: serviceAt.toISOString(),
      status: "C",
      team_position_name: "Vocals",
      team_name: "Band",
      service_type_name: "Sunday",
    },
    relationships: {
      plan: ref("Plan", planId),
      plan_times: refs("PlanTime", [service.id]),
      times: refs("PlanTime", [service.id, rehearsal.id]),
    },
  };
  return { planId, service, rehearsal, schedule };
};

type ServedPlan = ReturnType<typeof servedPlan>;

const weeklyBlockout = (id: string): PCResource => ({
  type: "Blockout",
  id,
  attributes: {
    starts_at: "2026-01-01T00:00:00.000Z",
    ends_at: "2026-01-01T23:59:59.000Z",
    repeat_frequency: "every_1_week",
    repeat_until: null,
    time_zone: "UTC",
    share: false,
  },
});

const blockoutDate = (id: string, day: string): PCResource => ({
  type: "BlockoutDate",
  id,
  attributes: {
    starts_at: `${day}T00:00:00.000Z`,
    ends_at: `${day}T23:59:59.000Z`,
    time_zone: "UTC",
  },
});

type People = CandidateDetailsDependencies["people"];

interface PersonFixture {
  readonly plans?: readonly ServedPlan[];
  readonly repeatingBlockouts?: number;
  /** Index of the repeating blockout whose date covers the plan day. */
  readonly coveringBlockout?: number;
}

const createPeople = (fixtures: Readonly<Record<string, PersonFixture>>) => {
  const planTimesById = new Map<string, PCResource[]>();
  for (const { plans = [] } of Object.values(fixtures)) {
    for (const plan of plans) {
      planTimesById.set(plan.planId, [plan.service, plan.rehearsal]);
    }
  }
  const people = {
    getPersonBlockouts: vi.fn<People["getPersonBlockouts"]>((personId) => {
      const { repeatingBlockouts = 0 } = fixtures[personId] ?? {};
      return countedRead(
        Array.from({ length: repeatingBlockouts }, (_, index) =>
          weeklyBlockout(`${personId}-blockout-${index}`)
        )
      );
    }),
    getPersonBlockoutDates: vi.fn<People["getPersonBlockoutDates"]>(
      (personId, blockoutId) => {
        const { coveringBlockout } = fixtures[personId] ?? {};
        const covers =
          blockoutId === `${personId}-blockout-${coveringBlockout}`;
        return countedRead(
          covers
            ? [blockoutDate(`${blockoutId}-date`, PLAN_DATE.slice(0, 10))]
            : [blockoutDate(`${blockoutId}-date`, "2026-05-05")]
        );
      }
    ),
    getPersonSchedulesAfter: vi.fn<People["getPersonSchedulesAfter"]>(
      (personId) => {
        const { plans = [] } = fixtures[personId] ?? {};
        // `include=plan_times` sideloads only service times.
        return countedRead({
          data: plans.map(({ schedule }) => schedule),
          included: plans.map(({ service }) => service),
        });
      }
    ),
    getPlanPlanTimes: vi.fn<People["getPlanPlanTimes"]>((planId) =>
      countedRead(planTimesById.get(planId) ?? [])
    ),
  };
  return people;
};

const runCall = async (
  input: CandidateDetailsInput,
  people: People,
  accounting = new PlanningCenterRequestAccounting({
    requestBudget: PLANNING_CENTER_REQUEST_CAP,
  })
): Promise<{ batch: CandidateDetailsBatch; requests: number }> => {
  const batch = await Effect.runPromise(
    getCandidateDetails(input, {
      people,
      resolveTimeZone: countedRead("UTC"),
    }).pipe(Effect.provideService(PlanningCenterAccounting, accounting))
  );
  return { batch, requests: accounting.requestCount };
};

const advanced = (
  before: CandidateDetailsInput["blockoutProgress"],
  batch: CandidateDetailsBatch
): boolean =>
  batch.people.length > 0 ||
  batch.blockoutProgress.some(({ personId, checkedBlockoutIds, blocked }) => {
    const previous = before?.find((entry) => entry.personId === personId);
    return (
      blocked !== (previous?.blocked ?? false) ||
      checkedBlockoutIds.length > (previous?.checkedBlockoutIds.length ?? 0)
    );
  });

/** Follows continuations the way the browser does, one Worker invocation per call. */
const loadAll = async (
  input: CandidateDetailsInput,
  people: People
): Promise<{ details: CandidateDetail[]; requests: number[] }> => {
  const { batch, requests } = await runCall(input, people);
  if (!advanced(input.blockoutProgress, batch)) {
    throw new Error("Candidate details made no progress");
  }
  if (batch.deferredPersonIds.length === 0) {
    return { details: batch.people, requests: [requests] };
  }
  const rest = await loadAll(
    {
      ...input,
      personIds: batch.deferredPersonIds,
      blockoutProgress: batch.blockoutProgress,
    },
    people
  );
  return {
    details: [...batch.people, ...rest.details],
    requests: [requests, ...rest.requests],
  };
};

const rehearsalItems = (detail: CandidateDetail | undefined) =>
  detail?.history?.serviceHistory
    .filter((item) => item.timeType === "rehearsal")
    .map((item) => item.id) ?? [];

describe(getCandidateDetails, () => {
  it("resolves schedule-history rehearsal times plan by plan within the budget, deferring the rest", async () => {
    // 16 people, each serving four plans in the window: far more plan reads than one call allows.
    const fixtures = Object.fromEntries(
      Array.from({ length: 16 }, (_, index) => [
        `p${index}`,
        {
          plans: [-21, -14, -7, 7].map((days) => servedPlan(`p${index}`, days)),
        },
      ])
    );
    const people = createPeople(fixtures);
    const input = {
      personIds: Object.keys(fixtures),
      planId: PLAN_ID,
      date: PLAN_DATE,
      scheduleHistory: true,
    };

    const first = await runCall(input, people);
    const { details, requests } = await loadAll(input, people);

    expect({
      firstCallWithinBudget: first.requests <= PROGRESSIVE_REQUEST_BUDGET,
      firstCallDeferred: first.batch.deferredPersonIds.length > 0,
      everyCallWithinBudget: requests.every(
        (sent) => sent <= PROGRESSIVE_REQUEST_BUDGET
      ),
      reportedRequests: first.batch.requestBudget.planningCenterRequests,
      people: details.length,
      rehearsalsPerPerson: new Set(
        details.map((detail) => rehearsalItems(detail).length)
      ),
    }).toStrictEqual({
      firstCallWithinBudget: true,
      firstCallDeferred: true,
      everyCallWithinBudget: true,
      reportedRequests: first.requests,
      people: 16,
      rehearsalsPerPerson: new Set([4]),
    });
  });

  it("reads schedules from the window start and skips rehearsal reads outside the window", async () => {
    const plans = [servedPlan("p1", -7), servedPlan("p1", 60)];
    const people = createPeople({ p1: { plans } });

    const { batch } = await runCall(
      {
        personIds: ["p1"],
        planId: PLAN_ID,
        date: PLAN_DATE,
        scheduleHistory: true,
      },
      people
    );

    expect({
      schedules: people.getPersonSchedulesAfter.mock.calls,
      planReads: people.getPlanPlanTimes.mock.calls.map(([planId]) => planId),
      rehearsals: rehearsalItems(batch.people[0]),
    }).toStrictEqual({
      schedules: [["p1", "2026-04-05", 2]],
      planReads: [plans[0]?.planId],
      rehearsals: [`${plans[0]?.schedule.id}:${plans[0]?.rehearsal.id}`],
    });
  });

  it("makes progress on a person whose repeating blockouts need more reads than one call allows", async () => {
    const people = createPeople({
      p1: { repeatingBlockouts: 90, coveringBlockout: 80 },
      p2: { repeatingBlockouts: 1 },
    });

    const { details, requests } = await loadAll(
      {
        personIds: ["p1", "p2"],
        planId: PLAN_ID,
        date: PLAN_DATE,
        scheduleHistory: false,
      },
      people
    );

    expect({
      blocked: Object.fromEntries(
        details.map(({ personId, isBlockedForDate }) => [
          personId,
          isBlockedForDate,
        ])
      ),
      everyCallUnderCap: requests.every(
        (sent) => sent <= PLANNING_CENTER_REQUEST_CAP
      ),
      calls: requests.length,
      datesReadOnce:
        new Set(people.getPersonBlockoutDates.mock.calls.map(([, id]) => id))
          .size === people.getPersonBlockoutDates.mock.calls.length,
    }).toStrictEqual({
      blocked: { p1: true, p2: false },
      everyCallUnderCap: true,
      calls: 3,
      datesReadOnce: true,
    });
  });

  it("admits the first person even when the procedure already spent its budget", async () => {
    const people = createPeople({ p1: { repeatingBlockouts: 1 }, p2: {} });
    const accounting = new PlanningCenterRequestAccounting({
      requestBudget: PLANNING_CENTER_REQUEST_CAP,
    });
    for (let index = 0; index < PROGRESSIVE_REQUEST_BUDGET; index += 1) {
      accounting.recordRequest();
    }

    const { batch } = await runCall(
      {
        personIds: ["p1", "p2"],
        planId: PLAN_ID,
        date: PLAN_DATE,
        scheduleHistory: false,
      },
      people,
      accounting
    );

    expect({
      detailed: batch.people.map(({ personId }) => personId),
      deferred: batch.deferredPersonIds,
    }).toStrictEqual({ detailed: ["p1"], deferred: ["p2"] });
  });
});
