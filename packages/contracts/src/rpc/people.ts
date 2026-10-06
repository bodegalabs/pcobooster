/** People procedures over Effect RPC. Ported from the zod schemas in `../people.ts`. */
import {
  PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE,
  PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE,
} from "@pcobooster/contracts/people";
import { planningCenterGroup } from "@pcobooster/contracts/rpc/group";
import {
  blockoutProgressSchema,
  blockoutSchema,
  candidateDetailsBatchSchema,
  myScheduledPlansDataSchema,
  peopleDashboardActivityBatchSchema,
  peopleDashboardPersonDetailSchema,
  peopleDashboardRosterSchema,
  peopleSearchResultSchema,
  planWindowHistoryBatchSchema,
  positionCandidatesSchema,
  windowPlanRefSchema,
} from "@pcobooster/contracts/rpc/people-schemas";
import { read } from "@pcobooster/contracts/rpc/procedure";
import {
  isoDateTimeWithOffset,
  mutableArray,
  requiredId,
} from "@pcobooster/contracts/rpc/schema";
import { Schema } from "effect";

const MAX_CONTINUATION_PLANS = 1000;
const MAX_CONTINUATION_SERVICE_TYPES = 200;
const PEOPLE_SEARCH_MIN_LENGTH = 2;
const PEOPLE_SEARCH_MAX_LENGTH = 80;
const MONTH_KEY = /^\d{4}-\d{2}$/u;

export const peoplePositionCandidatesInputSchema = Schema.Struct({
  serviceTypeId: requiredId,
  positionId: requiredId,
  teamId: Schema.optional(requiredId),
  planId: requiredId,
});

/** The selected plan's sort instant, as an ISO date-time with its offset. */
const planDateSchema = isoDateTimeWithOffset;

export const peoplePlanWindowHistoryInputSchema = Schema.Struct({
  date: planDateSchema,
  /** Where the previous call stopped; omit on the first call. */
  continuation: Schema.optional(
    Schema.Struct({
      plans: mutableArray(windowPlanRefSchema).check(
        Schema.isMaxLength(MAX_CONTINUATION_PLANS)
      ),
      serviceTypeIds: mutableArray(requiredId).check(
        Schema.isMaxLength(MAX_CONTINUATION_SERVICE_TYPES)
      ),
    })
  ),
});

const personBatchSchema = (maximum: number) =>
  mutableArray(requiredId).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(maximum)
  );

export const peopleCandidateDetailsInputSchema = Schema.Struct({
  personIds: personBatchSchema(PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE),
  planId: requiredId,
  date: planDateSchema,
  /** Also read each person's own schedules; only when the plan window is empty. */
  scheduleHistory: Schema.Boolean,
  /** From the previous call's `blockoutProgress`; omit on the first call. */
  blockoutProgress: Schema.optional(
    mutableArray(blockoutProgressSchema).check(
      Schema.isMaxLength(PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE)
    )
  ),
});

export const peopleSearchInputSchema = Schema.Struct({
  query: Schema.Trim.check(
    Schema.isMinLength(PEOPLE_SEARCH_MIN_LENGTH),
    Schema.isMaxLength(PEOPLE_SEARCH_MAX_LENGTH)
  ),
});

export const peopleBlockoutsInputSchema = Schema.Struct({
  personId: requiredId,
});

export const peopleDashboardActivityInputSchema = Schema.Struct({
  personIds: personBatchSchema(PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE),
});

export const peopleDashboardPersonInputSchema = Schema.Struct({
  ...peopleBlockoutsInputSchema.fields,
  month: Schema.optional(Schema.String.check(Schema.isPattern(MONTH_KEY))),
});

export const peoplePositionCandidates = read("people.positionCandidates", {
  payload: peoplePositionCandidatesInputSchema,
  success: positionCandidatesSchema,
});

/** Partial with a continuation cursor: pass `deferredPlans` and the ids back to continue. */
export const peoplePlanWindowHistory = read("people.planWindowHistory", {
  payload: peoplePlanWindowHistoryInputSchema,
  success: planWindowHistoryBatchSchema,
});

/** Partial with a continuation cursor: `deferredPersonIds` and `blockoutProgress`. */
export const peopleCandidateDetails = read("people.candidateDetails", {
  payload: peopleCandidateDetailsInputSchema,
  success: candidateDetailsBatchSchema,
});

export const peopleSearch = read("people.search", {
  payload: peopleSearchInputSchema,
  success: mutableArray(peopleSearchResultSchema),
});

export const peopleBlockouts = read("people.blockouts", {
  payload: peopleBlockoutsInputSchema,
  success: mutableArray(blockoutSchema),
});

/** Main's contract takes no input (`.output` only). */
export const peopleDashboardRoster = read("people.dashboardRoster", {
  payload: Schema.Void,
  success: peopleDashboardRosterSchema,
  feature: "people",
});

/** Partial with a continuation cursor: `deferredPersonIds`. */
export const peopleDashboardActivity = read("people.dashboardActivity", {
  payload: peopleDashboardActivityInputSchema,
  success: peopleDashboardActivityBatchSchema,
  feature: "people",
});

/** Partial without a cursor: `requestBudget.unresolvedRehearsalTimes` says what is missing. */
export const peopleDashboardPerson = read("people.dashboardPerson", {
  payload: peopleDashboardPersonInputSchema,
  success: peopleDashboardPersonDetailSchema,
  feature: "people",
});

export const peopleMyScheduledPlans = read("people.myScheduledPlans", {
  payload: Schema.Struct({}),
  success: myScheduledPlansDataSchema,
});

export const peopleProcedures = [
  peoplePositionCandidates,
  peoplePlanWindowHistory,
  peopleCandidateDetails,
  peopleSearch,
  peopleBlockouts,
  peopleDashboardRoster,
  peopleDashboardActivity,
  peopleDashboardPerson,
  peopleMyScheduledPlans,
] as const;
export const peopleRpc = planningCenterGroup(...peopleProcedures);
