import { moduleLog } from "@pcobooster/api/logging";
import { mapSchedulesToServiceHistory } from "@pcobooster/api/modules/planning-center/people/history";
import {
  planTimePageReads,
  PlanTimeProgress,
} from "@pcobooster/api/modules/planning-center/people/plan-time-pages";
import type {
  PlanTimesProgress,
  PlanTimesWanted,
} from "@pcobooster/api/modules/planning-center/people/plan-time-pages";
import { scheduleResourceSchema } from "@pcobooster/api/modules/planning-center/people/resource-schemas";
import { selectedPlanAssignmentsFor } from "@pcobooster/api/modules/planning-center/people/selected-plan-assignments";
import {
  blockoutDateCoversPlanDate,
  isRepeatingBlockout,
  repeatingBlockoutMayCover,
} from "@pcobooster/api/modules/planning-center/people/transforms";
import { PLANNING_CENTER_PAGE_SIZE } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import { readPagesWithinBudget } from "@pcobooster/api/planning-center/page-budget";
import type { PageRead } from "@pcobooster/api/planning-center/page-budget";
import { PlanningCenterPaginationError } from "@pcobooster/api/planning-center/pagination-error";
import {
  planningCenterRequestsSpent,
  PROGRESSIVE_REQUEST_BUDGET,
  withPlanningCenterRequestCount,
} from "@pcobooster/api/planning-center/request-budget";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import { MAX_PENDING_BLOCKOUTS } from "@pcobooster/contracts/http/people-schemas";
import {
  addCalendarDaysToDayKey,
  formatCalendarDayInTimeZone,
} from "@pcobooster/planning-center-models/calendar";
import {
  isNonEmptyString,
  isString,
} from "@pcobooster/planning-center-models/json";
import type { CandidateHistory } from "@pcobooster/planning-center-models/position-candidates";
import {
  PLAN_HISTORY_HALF_RANGE_DAYS,
  REHEARSAL_WINDOW_MARGIN_DAYS,
} from "@pcobooster/planning-center-models/schedule-constants";
import type {
  PCRelationship,
  PCResource,
  RawSchedule,
} from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

const log = moduleLog("planning-center/candidate-details");

/**
 * Pages of 100 schedules one person may have from the start of the plan window on. Every page is
 * read: schedules come in `starts_at` order while history dates them by `sort_date` and their
 * times, so no page proves the rest hold nothing history or the selected plan needs. A person
 * with more than this fails the read rather than leave history out.
 */
const SCHEDULE_MAX_PAGES = 10;
/**
 * Starting another person leaves this much of the budget for the pages of people already
 * started (about a plan every week of the window and a midweek one on top), so calls finish
 * people instead of starting everyone.
 */
const START_RESERVE = 13;
/** A Worker keeps at most 6 connections waiting for response headers. */
const READ_CONCURRENCY = 6;

export interface CandidateDetail {
  personId: string;
  isBlockedForDate: boolean;
  /** The person's own schedule history; present only when it was asked for. */
  history?: CandidateHistory;
}

/** A repeating blockout whose dates are being read page by page. */
export interface PendingBlockout {
  blockoutId: string;
  /** The parent's time zone, which its dates fall back to. */
  timeZone: string | null;
  datesOffset: number;
}

/** What earlier calls learned about a person they left unfinished. */
export interface CandidatePersonProgress {
  personId: string;
  /** A blockout covers the plan day; no more blockout pages are needed. */
  blocked: boolean;
  /** The next page of the person's blockout list, or `null` once it is all read. */
  blockoutsOffset: number | null;
  /** Repeating blockouts from the list read so far whose dates may still cover the day. */
  pendingBlockouts: PendingBlockout[];
  /** For schedule history: the rehearsal plans whose times were read, and the times found. */
  rehearsalTimes: PlanTimesProgress;
}

/** Everything a follow-up call needs to resume, with fresh caches, where this one stopped. */
export interface CandidateDetailsContinuation {
  people: CandidatePersonProgress[];
}

export interface CandidateDetailsBatch {
  generatedAt: string;
  /** People whose details are complete. */
  people: CandidateDetail[];
  /** Requested people left for a follow-up call to stay within the request budget. */
  deferredPersonIds: string[];
  /** Pass back with `deferredPersonIds`; empty once nobody is deferred. */
  continuation: CandidateDetailsContinuation;
  requestBudget: {
    limit: number;
    /** Planning Center requests this procedure sent; cached reads cost none. */
    planningCenterRequests: number;
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
  /** From the previous call's `continuation`. */
  readonly continuation?: CandidateDetailsContinuation;
}

export interface CandidateDetailsDependencies {
  readonly people: Pick<
    PlanningCenterPeopleService,
    | "getPersonBlockoutDatesPage"
    | "getPersonBlockoutsPage"
    | "getPersonSchedulesPage"
    | "getPlanPlanTimesPage"
  >;
  readonly resolveTimeZone: Effect.Effect<string, PlanningCenterError>;
}

interface PersonSchedules {
  readonly data: PCResource[];
  readonly included: PCResource[];
}

/** A person's schedules in the window, read page by page during one call. */
interface ScheduleRead {
  /** The page to read next, or `null` once every schedule from the window's start is read. */
  offset: number | null;
  pages: number;
  /** Schedules from the window's start, by id: pages read apart may repeat one. */
  readonly data: Map<string, PCResource>;
  readonly included: Map<string, PCResource>;
}

/** One person's reads during a call. */
interface PersonState {
  readonly personId: string;
  /** Something was read for the person, in this call or an earlier one. */
  started: boolean;
  blocked: boolean;
  blockoutsOffset: number | null;
  readonly pendingBlockouts: Map<string, PendingBlockout>;
  /** `null` when history was not asked for. */
  readonly schedules: ScheduleRead | null;
  /** The rehearsal plans whose times history reads, with the times it looks for. */
  rehearsalPlans: ReadonlyMap<string, readonly string[]>;
  readonly rehearsalTimes: PlanTimeProgress;
  /** The times `rehearsalTimes` keeps: those the person's rehearsal plans list. */
  readonly wantedTimeIds: Set<string>;
}

const relationshipIds = (data: PCRelationship["data"]): string[] => {
  if (data === undefined || data === null) {
    return [];
  }
  return Array.isArray(data) ? data.map(({ id }) => id) : [data.id];
};

/** Every blockout page is read, or a blockout covers the plan day. */
const availabilityDone = (state: PersonState): boolean =>
  state.blocked ||
  (state.blockoutsOffset === null && state.pendingBlockouts.size === 0);

/** History was not asked for, or the schedules and every rehearsal time it needs are read. */
const historyDone = (state: PersonState): boolean =>
  state.schedules === null ||
  (state.schedules.offset === null &&
    [...state.rehearsalPlans].every(
      ([id, timeIds]) => state.rehearsalTimes.nextPage(id, timeIds) === null
    ));

const done = (state: PersonState): boolean =>
  availabilityDone(state) && historyDone(state);

/** A covering blockout settles availability: no other blockout page can change it. */
const markBlocked = (state: PersonState): void => {
  state.blocked = true;
  state.blockoutsOffset = null;
  state.pendingBlockouts.clear();
};

/**
 * Plans in the rehearsal window whose schedules list PlanTimes that `include=plan_times` left
 * out, with those times: rehearsal times are listed in `times` but never sideloaded. In date
 * order.
 */
const plansMissingRehearsalTimes = (
  { data, included }: PersonSchedules,
  lastDayKey: string,
  orgTimeZone: string
): Map<string, string[]> => {
  const sideloaded = new Set(
    included.flatMap(({ type, id }) => (type === "PlanTime" ? [id] : []))
  );
  const byPlan = new Map<string, string[]>();
  for (const schedule of data) {
    const [planId] = relationshipIds(schedule.relationships?.plan?.data);
    const sortDate = schedule.attributes.sort_date;
    const missing = relationshipIds(schedule.relationships?.times?.data).filter(
      (id) => !sideloaded.has(id)
    );
    if (
      missing.length > 0 &&
      isNonEmptyString(planId) &&
      isNonEmptyString(sortDate) &&
      !Number.isNaN(Date.parse(sortDate)) &&
      formatCalendarDayInTimeZone(new Date(sortDate), orgTimeZone) <= lastDayKey
    ) {
      byPlan.set(planId, [...(byPlan.get(planId) ?? []), ...missing]);
    }
  }
  return byPlan;
};

const schedulesOf = ({ data, included }: ScheduleRead): PersonSchedules => ({
  data: [...data.values()],
  included: [...included.values()],
});

const scheduleHistoryFrom = (
  { data, included }: PersonSchedules,
  planTimes: readonly PCResource[],
  planId: string
): CandidateHistory => {
  const schedules: RawSchedule[] = [];
  for (const resource of data) {
    const parsed = scheduleResourceSchema.safeParse(resource);
    if (parsed.success) {
      schedules.push(parsed.data);
    }
  }
  const listed = new Set(
    data.flatMap((schedule) =>
      relationshipIds(schedule.relationships?.times?.data)
    )
  );
  return {
    serviceHistory: mapSchedulesToServiceHistory(schedules, [
      ...included,
      ...planTimes.filter(({ id }) => listed.has(id)),
    ]),
    selectedPlanAssignments: selectedPlanAssignmentsFor(schedules, planId),
  };
};

/**
 * Whether a blockout covers the plan date for a batch of candidates, and, when the plan window
 * has no plans, their history from their own schedules. Each call plans its page reads against
 * `PROGRESSIVE_REQUEST_BUDGET` Planning Center requests, counting what was really sent.
 *
 * A person's blockout list, each repeating blockout's generated dates, and each rehearsal
 * plan's times are read a page at a time, so a person costs one request per page actually
 * needed: a repeating blockout stops at the first date page that covers the plan day, and a
 * person found blocked reads no more blockout pages. Blockout lists are read unfiltered:
 * Planning Center's `future` filter is not verified for repeating blockouts that started in the
 * past. A list page is read only while the cursor can hold the repeating blockouts it may add;
 * until then the pending ones' dates are read. For schedule history a person also costs every
 * schedule page from the window's start on, and the times of every plan in the rehearsal window
 * whose times the schedules list but `include` left out (shared by everyone on that plan).
 * History holds every schedule read, as it did when they were read whole.
 *
 * People who do not finish come back in `deferredPersonIds`, and `continuation` holds every
 * page they still need, except schedule pages: a follow-up call reads those again (from cache
 * when it can), and the first unfinished person's are always kept room for. Availability and
 * history are complete only once every page they depend on is read. Every call finishes or
 * advances someone. Failed reads fail the call, and a window needing more than
 * `SCHEDULE_MAX_PAGES` schedule pages fails it typed.
 */
export const getCandidateDetails = (
  {
    personIds,
    planId,
    date,
    scheduleHistory,
    continuation,
  }: CandidateDetailsInput,
  { people, resolveTimeZone }: CandidateDetailsDependencies
): Effect.Effect<CandidateDetailsBatch, PlanningCenterError> =>
  Effect.gen(function* readCandidateDetails() {
    const planSortAt = new Date(date);
    const orgTimeZone = yield* resolveTimeZone;
    const planDayKey = formatCalendarDayInTimeZone(planSortAt, orgTimeZone);
    const windowStartDayKey = addCalendarDaysToDayKey(
      planDayKey,
      -PLAN_HISTORY_HALF_RANGE_DAYS
    );
    const rehearsalLastDayKey = addCalendarDaysToDayKey(
      planDayKey,
      PLAN_HISTORY_HALF_RANGE_DAYS + REHEARSAL_WINDOW_MARGIN_DAYS
    );
    const progressByPersonId = new Map(
      (continuation?.people ?? []).map((progress) => [
        progress.personId,
        progress,
      ])
    );
    const states = [...new Set(personIds)].map((personId): PersonState => {
      const progress = progressByPersonId.get(personId);
      const wantedTimeIds = new Set<string>();
      return {
        personId,
        started: progress !== undefined,
        blocked: progress?.blocked ?? false,
        blockoutsOffset: progress === undefined ? 0 : progress.blockoutsOffset,
        pendingBlockouts: new Map(
          (progress?.pendingBlockouts ?? []).map((pending) => [
            pending.blockoutId,
            pending,
          ])
        ),
        schedules: scheduleHistory
          ? { offset: 0, pages: 0, data: new Map(), included: new Map() }
          : null,
        rehearsalPlans: new Map(),
        rehearsalTimes: new PlanTimeProgress(progress?.rehearsalTimes, (id) =>
          wantedTimeIds.has(id)
        ),
        wantedTimeIds,
      };
    });
    const pagesRead = {
      blockoutLists: 0,
      blockoutDates: 0,
      schedules: 0,
      planTimes: 0,
    };

    const readBlockoutList = (
      state: PersonState,
      offset: number
    ): Effect.Effect<void, PlanningCenterError> =>
      Effect.map(
        Effect.suspend(() =>
          people.getPersonBlockoutsPage(state.personId, offset)
        ),
        (page) => {
          pagesRead.blockoutLists += 1;
          state.started = true;
          if (state.blocked) {
            return;
          }
          for (const parent of page.data) {
            if (!isRepeatingBlockout(parent)) {
              if (blockoutDateCoversPlanDate(parent, null, planSortAt)) {
                markBlocked(state);
                return;
              }
            } else if (repeatingBlockoutMayCover(parent, planSortAt)) {
              const { time_zone: timeZone } = parent.attributes;
              state.pendingBlockouts.set(parent.id, {
                blockoutId: parent.id,
                timeZone: isString(timeZone) ? timeZone : null,
                datesOffset: 0,
              });
            }
          }
          state.blockoutsOffset = page.nextOffset;
        }
      );

    const readBlockoutDates = (
      state: PersonState,
      pending: PendingBlockout
    ): Effect.Effect<void, PlanningCenterError> =>
      Effect.map(
        Effect.suspend(() =>
          people.getPersonBlockoutDatesPage(
            state.personId,
            pending.blockoutId,
            pending.datesOffset
          )
        ),
        (page) => {
          pagesRead.blockoutDates += 1;
          state.started = true;
          if (state.blocked) {
            return;
          }
          if (
            page.data.some((blockoutDate) =>
              blockoutDateCoversPlanDate(
                blockoutDate,
                pending.timeZone,
                planSortAt
              )
            )
          ) {
            markBlocked(state);
          } else if (page.nextOffset === null) {
            state.pendingBlockouts.delete(pending.blockoutId);
          } else {
            state.pendingBlockouts.set(pending.blockoutId, {
              ...pending,
              datesOffset: page.nextOffset,
            });
          }
        }
      );

    const readSchedulePage = (
      state: PersonState,
      schedules: ScheduleRead,
      offset: number
    ): Effect.Effect<void, PlanningCenterError> =>
      Effect.flatMap(
        Effect.suspend(() =>
          people.getPersonSchedulesPage(
            state.personId,
            windowStartDayKey,
            offset
          )
        ),
        (page) => {
          pagesRead.schedules += 1;
          state.started = true;
          schedules.pages += 1;
          for (const schedule of page.data) {
            schedules.data.set(schedule.id, schedule);
          }
          for (const resource of page.included) {
            schedules.included.set(`${resource.type}:${resource.id}`, resource);
          }
          if (page.nextOffset !== null) {
            if (schedules.pages === SCHEDULE_MAX_PAGES) {
              return Effect.fail(
                new PlanningCenterPaginationError({
                  reason: "page-limit",
                  path: `/services/v2/people/${state.personId}/schedules`,
                  pages: schedules.pages,
                })
              );
            }
            schedules.offset = page.nextOffset;
            return Effect.void;
          }
          schedules.offset = null;
          state.rehearsalPlans = plansMissingRehearsalTimes(
            schedulesOf(schedules),
            rehearsalLastDayKey,
            orgTimeZone
          );
          for (const [, timeIds] of state.rehearsalPlans) {
            for (const id of timeIds) {
              state.wantedTimeIds.add(id);
            }
          }
          return Effect.void;
        }
      );

    // Ready reads in priority order: people in order, each person's in the order they help.
    // A plan-time page several people wait on is read once, in the first one's place.
    const nextReads = (): PageRead[] => {
      const reads: { reader: number; read: PageRead }[] = [];
      const waitingOnPlans: PlanTimesWanted[] = [];
      const readerIndex: number[] = [];
      // Schedule pages are not part of the cursor, so the first unfinished person's are all
      // kept room for: everyone else's reads leave it, and the person's progress survives.
      const lead = states.findIndex((state) => !done(state));
      const leadSchedules = states[lead]?.schedules;
      const leadReserve =
        leadSchedules === null ||
        leadSchedules === undefined ||
        leadSchedules.offset === null
          ? 0
          : SCHEDULE_MAX_PAGES - leadSchedules.pages + 1;
      for (const [index, state] of states.entries()) {
        if (done(state)) {
          continue;
        }
        const starts = !state.started;
        const add = (read: PageRead) => {
          reads.push({ reader: index, read });
        };
        if (!availabilityDone(state)) {
          // A list page adds up to a page of repeating blockouts; while the cursor could not
          // hold them, the pending ones' dates are read first.
          if (
            state.blockoutsOffset !== null &&
            state.pendingBlockouts.size + PLANNING_CENTER_PAGE_SIZE <=
              MAX_PENDING_BLOCKOUTS
          ) {
            add({
              pages: 1,
              starts,
              run: readBlockoutList(state, state.blockoutsOffset),
            });
          }
          for (const pending of state.pendingBlockouts.values()) {
            add({ pages: 1, starts, run: readBlockoutDates(state, pending) });
          }
        }
        if (state.schedules !== null && state.schedules.offset !== null) {
          add({
            pages: 1,
            starts,
            run: readSchedulePage(
              state,
              state.schedules,
              state.schedules.offset
            ),
          });
        }
        waitingOnPlans.push({
          progress: state.rehearsalTimes,
          plans: state.rehearsalPlans,
        });
        readerIndex.push(index);
      }
      const planReads = planTimePageReads(people, waitingOnPlans, () => {
        pagesRead.planTimes += 1;
      });
      for (const { reader, read } of planReads) {
        reads.push({ reader: readerIndex[reader] ?? 0, read });
      }
      return reads
        .toSorted((a, b) => a.reader - b.reader)
        .map(({ reader, read }) =>
          reader === lead ? read : { ...read, reserve: leadReserve }
        );
    };

    yield* readPagesWithinBudget(nextReads, {
      concurrency: READ_CONCURRENCY,
      startReserve: START_RESERVE,
    });

    const details: CandidateDetail[] = [];
    const unfinished: PersonState[] = [];
    for (const state of states) {
      if (!done(state)) {
        unfinished.push(state);
        continue;
      }
      details.push({
        personId: state.personId,
        isBlockedForDate: state.blocked,
        ...(state.schedules === null
          ? undefined
          : {
              history: scheduleHistoryFrom(
                schedulesOf(state.schedules),
                state.rehearsalTimes.resources(),
                planId
              ),
            }),
      });
    }
    const spent = yield* planningCenterRequestsSpent;
    const batch: CandidateDetailsBatch = {
      generatedAt: new Date().toISOString(),
      people: details,
      deferredPersonIds: unfinished.map(({ personId }) => personId),
      continuation: {
        people: unfinished.flatMap((state) =>
          state.started
            ? [
                {
                  personId: state.personId,
                  blocked: state.blocked,
                  blockoutsOffset: state.blockoutsOffset,
                  pendingBlockouts: [...state.pendingBlockouts.values()],
                  rehearsalTimes: state.rehearsalTimes.progress(),
                },
              ]
            : []
        ),
      },
      requestBudget: {
        limit: PROGRESSIVE_REQUEST_BUDGET,
        planningCenterRequests: spent,
      },
    };
    yield* log.info("Candidate details read", {
      ...batch.requestBudget,
      blockoutListPages: pagesRead.blockoutLists,
      blockoutDatePages: pagesRead.blockoutDates,
      schedulePages: pagesRead.schedules,
      planTimePages: pagesRead.planTimes,
      requestedPeopleCount: states.length,
      detailedPeopleCount: details.length,
      deferredPeopleCount: unfinished.length,
    });
    return batch;
  }).pipe(withPlanningCenterRequestCount);
