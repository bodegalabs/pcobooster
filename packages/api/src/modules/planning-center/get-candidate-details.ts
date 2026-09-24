import { logger } from "@pcobooster/api/logger";
import {
  CANDIDATE_REQUEST_BUDGET,
  pagesFor,
  requestsSpent,
} from "@pcobooster/api/modules/planning-center/candidate-request-budget";
import { mapSchedulesToServiceHistory } from "@pcobooster/api/modules/planning-center/people/history";
import { scheduleResourceSchema } from "@pcobooster/api/modules/planning-center/people/resource-schemas";
import { selectedPlanAssignmentsFor } from "@pcobooster/api/modules/planning-center/people/selected-plan-assignments";
import {
  isBlockedOnPlanDate,
  repeatingBlockoutsToRead,
} from "@pcobooster/api/modules/planning-center/people/transforms";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import {
  addCalendarDaysToDayKey,
  formatCalendarDayInTimeZone,
} from "@pcobooster/planning-center-models/calendar";
import type { CandidateHistory } from "@pcobooster/planning-center-models/position-candidates";
import { PLAN_HISTORY_HALF_RANGE_DAYS } from "@pcobooster/planning-center-models/schedule-constants";
import type {
  PCResource,
  RawSchedule,
} from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

const log = logger.for("planning-center/candidate-details");

/** The organization time zone read, counted even when it is cached. */
const TIME_ZONE_REQUESTS = 1;
/**
 * Schedules are read from the start of the plan window in date order, so the first page (100
 * schedules) almost always covers the window; two leave room for heavy servers.
 */
const SCHEDULE_MAX_PAGES = 2;
/** Schedule pages plus rehearsal times of up to two plans, per person. */
const SCHEDULE_HISTORY_REQUESTS_PER_PERSON = SCHEDULE_MAX_PAGES + 2;
/** A Worker keeps at most 6 connections waiting for response headers. */
const READ_CONCURRENCY = 6;

export interface CandidateDetail {
  personId: string;
  isBlockedForDate: boolean;
  /** The person's own schedule history; present only when it was asked for. */
  history?: CandidateHistory;
}

export interface CandidateDetailsBatch {
  generatedAt: string;
  people: CandidateDetail[];
  /** Requested people left for a follow-up call to stay within the request budget. */
  deferredPersonIds: string[];
  requestBudget: {
    limit: number;
    /** Upper bound when transport does not count: cached reads count as requests. */
    planningCenterRequests: number;
    blockoutRequests: number;
    scheduleRequests: number;
  };
}

export interface CandidateDetailsInput {
  readonly personIds: readonly string[];
  readonly planId: string;
  /** The selected plan's sort instant. */
  readonly date: string;
  /**
   * Read each person's own schedules for history. Only needed when the plan window has no plans
   * to take history from.
   */
  readonly scheduleHistory: boolean;
}

export interface CandidateDetailsDependencies {
  readonly people: Pick<
    PlanningCenterPeopleService,
    "getPersonBlockoutDates" | "getPersonBlockouts" | "getPersonSchedules"
  >;
  readonly resolveTimeZone: Effect.Effect<string>;
}

type PersonSchedules = Effect.Success<
  ReturnType<CandidateDetailsDependencies["people"]["getPersonSchedules"]>
>;

interface FirstRead {
  readonly personId: string;
  readonly blockouts: PCResource[];
  readonly schedules: PersonSchedules | null;
}

const scheduleHistoryFrom = (
  { data, included }: PersonSchedules,
  planId: string
): CandidateHistory => {
  const schedules: RawSchedule[] = [];
  for (const resource of data) {
    const parsed = scheduleResourceSchema.safeParse(resource);
    if (parsed.success) {
      schedules.push(parsed.data);
    }
  }
  return {
    serviceHistory: mapSchedulesToServiceHistory(schedules, included),
    selectedPlanAssignments: selectedPlanAssignmentsFor(schedules, planId),
  };
};

/**
 * Whether a blockout covers the plan date for a batch of candidates, and, when the plan window
 * has no plans, their history from their own schedules. Stays within `CANDIDATE_REQUEST_BUDGET`
 * Planning Center requests.
 *
 * Each person costs one blockout page (more for people with over 100 blockouts) plus one
 * `blockout_dates` read per repeating blockout that may reach the plan date. Blockout lists
 * are read unfiltered: Planning Center's `future` filter is not verified for repeating
 * blockouts that started in the past. People who do not fit come back in `deferredPersonIds`;
 * failed reads fail the call.
 */
export const getCandidateDetails = (
  { personIds, planId, date, scheduleHistory }: CandidateDetailsInput,
  { people, resolveTimeZone }: CandidateDetailsDependencies
): Effect.Effect<CandidateDetailsBatch, PlanningCenterError> =>
  Effect.gen(function* readCandidateDetails() {
    const planSortAt = new Date(date);
    const orgTimeZone = yield* resolveTimeZone;
    const windowStartDayKey = addCalendarDaysToDayKey(
      formatCalendarDayInTimeZone(planSortAt, orgTimeZone),
      -PLAN_HISTORY_HALF_RANGE_DAYS,
      orgTimeZone
    );
    const uniquePersonIds = [...new Set(personIds)];
    const requestsPerPerson =
      1 + (scheduleHistory ? SCHEDULE_HISTORY_REQUESTS_PER_PERSON : 0);
    const admittedCount = Math.min(
      uniquePersonIds.length,
      Math.floor(
        (CANDIDATE_REQUEST_BUDGET - TIME_ZONE_REQUESTS) / requestsPerPerson
      )
    );
    const deferred = new Set(uniquePersonIds.slice(admittedCount));

    const firstReads = yield* Effect.forEach(
      uniquePersonIds.slice(0, admittedCount),
      (personId) =>
        Effect.map(
          Effect.all(
            [
              people.getPersonBlockouts(personId, {}),
              scheduleHistory
                ? people.getPersonSchedules(
                    personId,
                    {
                      filter: "after",
                      after: windowStartDayKey,
                      order: "starts_at",
                    },
                    SCHEDULE_MAX_PAGES
                  )
                : Effect.succeed(null),
            ],
            { concurrency: "unbounded" }
          ),
          ([blockouts, schedules]): FirstRead => ({
            personId,
            blockouts,
            schedules,
          })
        ),
      { concurrency: READ_CONCURRENCY }
    );

    const blockoutListRequests = firstReads.reduce(
      (total, { blockouts }) => total + pagesFor(blockouts.length),
      0
    );
    const scheduleRequests = scheduleHistory
      ? firstReads.length * SCHEDULE_HISTORY_REQUESTS_PER_PERSON
      : 0;
    const spent = yield* requestsSpent(
      TIME_ZONE_REQUESTS + blockoutListRequests + scheduleRequests
    );

    // Dates of repeating blockouts go to people in order while they fit.
    let remaining = CANDIDATE_REQUEST_BUDGET - spent;
    const datesToRead: { personId: string; blockoutId: string }[] = [];
    const finished: FirstRead[] = [];
    for (const read of firstReads) {
      const repeating = repeatingBlockoutsToRead(read.blockouts, planSortAt);
      if (repeating.length > remaining) {
        deferred.add(read.personId);
        continue;
      }
      remaining -= repeating.length;
      finished.push(read);
      for (const parent of repeating) {
        datesToRead.push({ personId: read.personId, blockoutId: parent.id });
      }
    }
    const dates = yield* Effect.forEach(
      datesToRead,
      ({ personId, blockoutId }) =>
        Effect.map(
          people.getPersonBlockoutDates(personId, blockoutId),
          (blockoutDates) => [blockoutId, blockoutDates] as const
        ),
      { concurrency: READ_CONCURRENCY }
    );
    const datesByBlockoutId = new Map<string, readonly PCResource[]>(dates);

    const details = finished.map(
      ({ personId, blockouts, schedules }): CandidateDetail => ({
        personId,
        isBlockedForDate: isBlockedOnPlanDate(
          blockouts,
          datesByBlockoutId,
          planSortAt
        ),
        ...(schedules === null
          ? undefined
          : { history: scheduleHistoryFrom(schedules, planId) }),
      })
    );
    const blockoutRequests = blockoutListRequests + datesToRead.length;
    const batch: CandidateDetailsBatch = {
      generatedAt: new Date().toISOString(),
      people: details,
      deferredPersonIds: uniquePersonIds.filter((id) => deferred.has(id)),
      requestBudget: {
        limit: CANDIDATE_REQUEST_BUDGET,
        planningCenterRequests: spent + datesToRead.length,
        blockoutRequests,
        scheduleRequests,
      },
    };
    log.info(
      {
        ...batch.requestBudget,
        requestedPeopleCount: uniquePersonIds.length,
        detailedPeopleCount: details.length,
        deferredPeopleCount: batch.deferredPersonIds.length,
      },
      "Candidate details read"
    );
    return batch;
  });
