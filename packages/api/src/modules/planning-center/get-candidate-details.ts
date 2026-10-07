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
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import { readPagesWithinBudget } from "@pcobooster/api/planning-center/page-budget";
import type { PageRead } from "@pcobooster/api/planning-center/page-budget";
import {
  planningCenterRequestsSpent,
  PROGRESSIVE_REQUEST_BUDGET,
  withPlanningCenterRequestCount,
} from "@pcobooster/api/planning-center/request-budget";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
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
 * Schedules are read from the start of the plan window in date order, so the first page (100
 * schedules) almost always covers the window; two leave room for heavy servers.
 */
const SCHEDULE_MAX_PAGES = 2;
/**
 * Plans whose times are read for one person's rehearsals, at most: a plan every week of the
 * window and a midweek one on top. Later plans in the window keep their plan dates without
 * rehearsal times.
 */
const MAX_REHEARSAL_PLAN_READS_PER_PERSON = 12;
/**
 * Starting another person leaves this much of the budget for the pages of people already
 * started, so calls finish people instead of starting everyone.
 */
const START_RESERVE = MAX_REHEARSAL_PLAN_READS_PER_PERSON + 1;
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
    | "getPersonSchedulesAfter"
    | "getPlanPlanTimesPage"
  >;
  readonly resolveTimeZone: Effect.Effect<string, PlanningCenterError>;
}

type PersonSchedules = Effect.Success<
  ReturnType<CandidateDetailsDependencies["people"]["getPersonSchedulesAfter"]>
>;

/** One person's reads during a call. */
interface PersonState {
  readonly personId: string;
  /** Something was read for the person, in this call or an earlier one. */
  started: boolean;
  blocked: boolean;
  blockoutsOffset: number | null;
  readonly pendingBlockouts: Map<string, PendingBlockout>;
  /** `undefined` until read; `null` when history was not asked for. */
  schedules: PersonSchedules | null | undefined;
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
  (state.schedules !== undefined &&
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
 * past. For schedule history a person also costs up to two schedule pages and the times of up
 * to 12 plans in the window with rehearsal times (shared by everyone on that plan).
 *
 * People who do not finish come back in `deferredPersonIds`, and `continuation` holds every
 * page they still need. Availability is complete only once every list and date page is read or
 * a date covers the plan day. Every call finishes or advances someone. Failed reads fail the
 * call.
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
        schedules: scheduleHistory ? undefined : null,
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
    let unreadRehearsalPlans = 0;

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

    const readSchedules = (
      state: PersonState
    ): Effect.Effect<void, PlanningCenterError> =>
      Effect.map(
        Effect.suspend(() =>
          people.getPersonSchedulesAfter(
            state.personId,
            windowStartDayKey,
            SCHEDULE_MAX_PAGES
          )
        ),
        (schedules) => {
          pagesRead.schedules += 1;
          state.started = true;
          const plans = [
            ...plansMissingRehearsalTimes(
              schedules,
              rehearsalLastDayKey,
              orgTimeZone
            ),
          ];
          unreadRehearsalPlans += Math.max(
            0,
            plans.length - MAX_REHEARSAL_PLAN_READS_PER_PERSON
          );
          state.schedules = schedules;
          state.rehearsalPlans = new Map(
            plans.slice(0, MAX_REHEARSAL_PLAN_READS_PER_PERSON)
          );
          for (const [, timeIds] of state.rehearsalPlans) {
            for (const id of timeIds) {
              state.wantedTimeIds.add(id);
            }
          }
        }
      );

    // Ready reads in priority order: people in order, each person's in the order they help.
    // A plan-time page several people wait on is read once, in the first one's place.
    const nextReads = (): PageRead[] => {
      const reads: { reader: number; read: PageRead }[] = [];
      const waitingOnPlans: PlanTimesWanted[] = [];
      const readerIndex: number[] = [];
      for (const [index, state] of states.entries()) {
        if (done(state)) {
          continue;
        }
        const starts = !state.started;
        const add = (read: PageRead) => {
          reads.push({ reader: index, read });
        };
        if (!availabilityDone(state)) {
          if (state.blockoutsOffset !== null) {
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
        if (state.schedules === undefined) {
          add({ pages: SCHEDULE_MAX_PAGES, starts, run: readSchedules(state) });
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
        .map(({ read }) => read);
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
        ...(state.schedules === null || state.schedules === undefined
          ? undefined
          : {
              history: scheduleHistoryFrom(
                state.schedules,
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
      unreadRehearsalPlanCount: unreadRehearsalPlans,
    });
    return batch;
  }).pipe(withPlanningCenterRequestCount);
