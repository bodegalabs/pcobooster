import { getPlanWindowHistory } from "@pcobooster/api/modules/planning-center/get-plan-window-history";
import type {
  PlanWindowHistoryBatch,
  PlanWindowHistoryDependencies,
  PlanWindowHistoryInput,
} from "@pcobooster/api/modules/planning-center/get-plan-window-history";
import { PlanningCenterAccounting } from "@pcobooster/api/planning-center/accounting";
import { PlanningCenterRequestAccounting } from "@pcobooster/api/planning-center/request-accounting";
import {
  PLANNING_CENTER_REQUEST_CAP,
  PROGRESSIVE_REQUEST_BUDGET,
} from "@pcobooster/api/planning-center/request-budget";
import { countedRead } from "@pcobooster/api/testing/planning-center-requests";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

/** Sunday May 3, 2026, 10:00 UTC. */
const PLAN_DATE = "2026-05-03T10:00:00.000Z";

interface OrgFixture {
  readonly serviceTypes: number;
  readonly plansPerServiceType: number;
  /** Requests a plan-range read costs: 3 uncached, 0 cached. */
  readonly rangeRequests: number;
  /** People scheduled on each plan, by plan index within its service type. */
  readonly planPeople?: (index: number) => number;
}

const createOrg = ({
  serviceTypes,
  plansPerServiceType,
  rangeRequests,
  planPeople = () => 10,
}: OrgFixture) => {
  const serviceTypeIds = Array.from(
    { length: serviceTypes },
    (_, index) => `st-${index}`
  );
  const plansByServiceType = new Map(
    serviceTypeIds.map((serviceTypeId) => [
      serviceTypeId,
      Array.from({ length: plansPerServiceType }, (_, index): PCResource => ({
        type: "Plan",
        id: `${serviceTypeId}-plan-${index}`,
        attributes: {
          sort_date: `2026-04-${String(10 + index).padStart(2, "0")}T10:00:00Z`,
          plan_people_count: planPeople(index),
        },
      })),
    ])
  );
  const rosterPages = (planId: string): number => {
    const index = Number(planId.split("-plan-")[1]);
    return Math.max(1, Math.ceil(planPeople(index) / 100));
  };
  const dependencies = {
    catalog: {
      getServiceTypesCached: () =>
        countedRead(
          serviceTypeIds.map((id): PCResource => ({
            type: "ServiceType",
            id,
            attributes: { archived_at: null, name: id },
          }))
        ),
    },
    people: {
      getPlanWindowRoster: (serviceTypeId: string, planId: string) =>
        countedRead(
          {
            data: [
              {
                type: "PlanPerson",
                id: `${planId}-member`,
                attributes: {
                  status: "C",
                  team_position_name: "Vocals",
                  created_at: "2026-01-01T00:00:00Z",
                },
                relationships: {
                  person: {
                    data: { type: "Person", id: `${serviceTypeId}-p` },
                  },
                  plan: { data: { type: "Plan", id: planId } },
                },
              },
            ],
            included: [],
          },
          rosterPages(planId)
        ),
    },
    plans: {
      getPlansWithIncludedInDateRange: (serviceTypeId: string) =>
        countedRead(
          { data: plansByServiceType.get(serviceTypeId) ?? [], included: [] },
          rangeRequests
        ),
    },
    resolveTimeZone: countedRead("UTC"),
  } satisfies PlanWindowHistoryDependencies;
  return dependencies;
};

const runCall = async (
  input: PlanWindowHistoryInput,
  dependencies: PlanWindowHistoryDependencies
): Promise<{ batch: PlanWindowHistoryBatch; requests: number }> => {
  const accounting = new PlanningCenterRequestAccounting({
    requestBudget: PLANNING_CENTER_REQUEST_CAP,
  });
  const batch = await Effect.runPromise(
    getPlanWindowHistory(input, dependencies).pipe(
      Effect.provideService(PlanningCenterAccounting, accounting)
    )
  );
  return { batch, requests: accounting.requestCount };
};

const loadAll = async (
  dependencies: PlanWindowHistoryDependencies,
  continuation?: PlanWindowHistoryInput["continuation"]
): Promise<{ loaded: number; requests: number[] }> => {
  const { batch, requests } = await runCall(
    { date: PLAN_DATE, continuation },
    dependencies
  );
  if (continuation !== undefined && batch.loadedPlanCount === 0) {
    throw new Error("Plan window history read no roster");
  }
  if (
    batch.deferredPlans.length === 0 &&
    batch.deferredServiceTypeIds.length === 0
  ) {
    return { loaded: batch.loadedPlanCount, requests: [requests] };
  }
  const rest = await loadAll(dependencies, {
    plans: batch.deferredPlans,
    serviceTypeIds: batch.deferredServiceTypeIds,
  });
  return {
    loaded: batch.loadedPlanCount + rest.loaded,
    requests: [requests, ...rest.requests],
  };
};

describe(getPlanWindowHistory, () => {
  it("counts real requests, so cached plan ranges leave the budget to rosters", async () => {
    const { batch, requests } = await runCall(
      { date: PLAN_DATE },
      createOrg({ serviceTypes: 10, plansPerServiceType: 2, rangeRequests: 0 })
    );

    expect({
      loaded: batch.loadedPlanCount,
      deferred:
        batch.deferredPlans.length + batch.deferredServiceTypeIds.length,
      reported: batch.requestBudget.planningCenterRequests,
    }).toStrictEqual({ loaded: 20, deferred: 0, reported: requests });
  });

  it("reads a roster in every follow-up call even when its plan ranges are not cached", async () => {
    const { loaded, requests } = await loadAll(
      createOrg({ serviceTypes: 12, plansPerServiceType: 4, rangeRequests: 3 })
    );

    expect({
      loaded,
      withinBudget: requests.every(
        (sent) => sent <= PROGRESSIVE_REQUEST_BUDGET
      ),
    }).toStrictEqual({ loaded: 48, withinBudget: true });
  });

  it("reads a pending plan with hundreds of people after uncached plan ranges", async () => {
    const { loaded, requests } = await loadAll(
      createOrg({
        serviceTypes: 12,
        plansPerServiceType: 2,
        rangeRequests: 3,
        planPeople: (index) => (index === 0 ? 1500 : 10),
      })
    );

    expect({
      loaded,
      underCap: requests.every((sent) => sent <= PLANNING_CENTER_REQUEST_CAP),
    }).toStrictEqual({ loaded: 24, underCap: true });
  });
});
