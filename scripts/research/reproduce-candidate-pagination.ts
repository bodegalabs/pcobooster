import { getCandidateDetails } from "@pcobooster/api/modules/planning-center/get-candidate-details";
import { PlanningCenterAccounting } from "@pcobooster/api/planning-center/accounting";
import { createBasicPlanningCenterClient } from "@pcobooster/api/planning-center/core-client";
import { PlanningCenterRequestAccounting } from "@pcobooster/api/planning-center/request-accounting";
import { PLANNING_CENTER_REQUEST_CAP } from "@pcobooster/api/planning-center/request-budget";
import { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import { httpClientFor } from "@pcobooster/api/testing/http-client";
import { countedRead } from "@pcobooster/api/testing/planning-center-requests";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Cause, Effect, Exit } from "effect";

type Scenario = "recurring-dates" | "plan-times";

const PAGE_SIZE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const PLAN_DATE = "2026-05-03T10:00:00Z";
const reference = (type: string, id: string) => ({ data: { type, id } });

const schedulesFor = (personId: string): PCResource[] =>
  Array.from({ length: 3 }, (_, index) => ({
    type: "Schedule",
    id: `${personId}-schedule-${index}`,
    attributes: {
      sort_date: PLAN_DATE,
      status: "C",
      team_position_name: "Vocals",
      team_name: "Band",
      service_type_name: "Sunday",
    },
    relationships: {
      plan: reference("Plan", `${personId}-plan-${index}`),
      times: {
        data: [{ type: "PlanTime", id: `${personId}-plan-${index}-time-100` }],
      },
      plan_times: { data: [] },
    },
  }));

const timesFor = (planId: string, offset: number): PCResource[] =>
  Array.from({ length: offset === 0 ? PAGE_SIZE : 1 }, (_, index) => ({
    type: "PlanTime",
    id: `${planId}-time-${offset + index}`,
    attributes: {
      starts_at: PLAN_DATE,
      ends_at: "2026-05-03T11:00:00Z",
      time_type: offset + index === 100 ? "rehearsal" : "service",
    },
    relationships: { plan: reference("Plan", planId) },
  }));

const datesFor = (offset: number): PCResource[] =>
  Array.from({ length: Math.min(PAGE_SIZE, 365 - offset) }, (_, index) => {
    const instant =
      Date.parse("2026-01-01T00:00:00Z") + (offset + index) * DAY_MS;
    return {
      type: "BlockoutDate",
      id: `date-${offset + index}`,
      attributes: {
        starts_at: new Date(instant).toISOString(),
        ends_at: new Date(instant + DAY_MS - 1000).toISOString(),
        time_zone: "UTC",
      },
    };
  });

const recurringBlockout: PCResource = {
  type: "Blockout",
  id: "daily",
  attributes: {
    starts_at: "2026-01-01T00:00:00Z",
    ends_at: "2026-01-01T23:59:59Z",
    repeat_frequency: "every_1_day",
    repeat_until: null,
    time_zone: "UTC",
  },
};

const responseFor = (scenario: Scenario, url: URL): Response => {
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const resourceId = url.pathname.split("/")[4] ?? "missing";
  let data: PCResource[] = [];
  let next: string | undefined;
  if (url.pathname.endsWith("/blockout_dates")) {
    data = datesFor(offset);
    if (offset + PAGE_SIZE < 365) {
      const nextUrl = new URL(url);
      nextUrl.searchParams.set("offset", String(offset + PAGE_SIZE));
      next = nextUrl.toString();
    }
  } else if (url.pathname.endsWith("/plan_times")) {
    data = timesFor(resourceId, offset);
    if (offset === 0) {
      const nextUrl = new URL(url);
      nextUrl.searchParams.set("offset", String(PAGE_SIZE));
      next = nextUrl.toString();
    }
  } else if (url.pathname.endsWith("/schedules")) {
    data = schedulesFor(resourceId);
  } else if (scenario === "recurring-dates") {
    data = [recurringBlockout];
  }
  return Response.json({
    data,
    included: [],
    links: next === undefined ? {} : { next },
  });
};

const reproduce = async (scenario: Scenario): Promise<void> => {
  let httpRequests = 0;
  let planTimePages = 0;
  const fetchFixture: typeof globalThis.fetch = async (input) => {
    await Promise.resolve();
    httpRequests += 1;
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.endsWith("/plan_times")) {
      planTimePages += 1;
    }
    return responseFor(scenario, url);
  };
  const people = new PlanningCenterPeopleService(
    createBasicPlanningCenterClient(
      { applicationId: "diagnostic-only", secret: "diagnostic-only" },
      httpClientFor(fetchFixture)
    )
  );
  const accounting = new PlanningCenterRequestAccounting({
    requestBudget: PLANNING_CENTER_REQUEST_CAP,
  });
  const exit = await Effect.runPromiseExit(
    getCandidateDetails(
      {
        personIds: Array.from({ length: 16 }, (_, index) => `person-${index}`),
        planId: "selected",
        date: PLAN_DATE,
        scheduleHistory: scenario === "plan-times",
      },
      { people, resolveTimeZone: countedRead("UTC") }
    ).pipe(Effect.provideService(PlanningCenterAccounting, accounting))
  );
  const failure = Exit.isFailure(exit)
    ? exit.cause.reasons.find(Cause.isFailReason)?.error
    : undefined;
  process.stdout.write(
    `${JSON.stringify(
      {
        scenario,
        outcome: Exit.isSuccess(exit) ? "success" : "failure",
        accountedRequests: accounting.requestCount,
        httpRequests,
        planTimePages,
        subrequestLimitHits: accounting.totals.subrequestLimitHits,
        failure: failure?.message,
        returnedPeople: Exit.isSuccess(exit) ? exit.value.people.length : null,
      },
      null,
      2
    )}\n`
  );
};

await reproduce("recurring-dates");
await reproduce("plan-times");
