import { RpcError } from "@pcobooster/contracts/errors";
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
} from "@pcobooster/contracts/people-schemas";
import { isoInstantWithOffsetSchema } from "@pcobooster/contracts/schema";
import { Schema, Struct } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

export const peoplePositionCandidatesInputSchema = Schema.Struct({
  serviceTypeId: Schema.Trim.check(Schema.isMinLength(1)),
  positionId: Schema.Trim.check(Schema.isMinLength(1)),
  teamId: Schema.optional(Schema.Trim.check(Schema.isMinLength(1))),
  planId: Schema.Trim.check(Schema.isMinLength(1)),
}).mapFields(Struct.map(Schema.mutableKey));

const planDateSchema = isoInstantWithOffsetSchema;

export const peoplePlanWindowHistoryInputSchema = Schema.Struct({
  date: planDateSchema,
  /** Where the previous call stopped; omit on the first call. */
  continuation: Schema.optional(
    Schema.Struct({
      plans: Schema.mutable(Schema.Array(windowPlanRefSchema)).check(
        Schema.isMaxLength(1000)
      ),
      serviceTypeIds: Schema.mutable(
        Schema.Array(Schema.Trim.check(Schema.isMinLength(1)))
      ).check(Schema.isMaxLength(200)),
    }).mapFields(Struct.map(Schema.mutableKey))
  ),
}).mapFields(Struct.map(Schema.mutableKey));

/**
 * Candidates per `people.candidateDetails` call. Each costs one blockout page
 * plus one read per repeating blockout near the plan date, so a full batch
 * stays well under the per-call budget.
 */
export const PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE = 16;

export const peopleCandidateDetailsInputSchema = Schema.Struct({
  personIds: Schema.mutable(
    Schema.Array(Schema.Trim.check(Schema.isMinLength(1)))
  )
    .check(Schema.isMinLength(1))
    .check(Schema.isMaxLength(PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE)),
  planId: Schema.Trim.check(Schema.isMinLength(1)),
  date: planDateSchema,
  /** Also read each person's own schedules; only when the plan window is empty. */
  scheduleHistory: Schema.Boolean,
  /** From the previous call's `blockoutProgress`; omit on the first call. */
  blockoutProgress: Schema.optional(
    Schema.mutable(Schema.Array(blockoutProgressSchema)).check(
      Schema.isMaxLength(PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE)
    )
  ),
}).mapFields(Struct.map(Schema.mutableKey));

export const peopleSearchInputSchema = Schema.Struct({
  query: Schema.Trim.check(Schema.isMinLength(2)).check(Schema.isMaxLength(80)),
}).mapFields(Struct.map(Schema.mutableKey));

export const peopleBlockoutsInputSchema = Schema.Struct({
  personId: Schema.Trim.check(Schema.isMinLength(1)),
}).mapFields(Struct.map(Schema.mutableKey));

/**
 * People per `people.dashboardActivity` call. Each person costs one schedule
 * page (two at most), so a full batch stays well under the per-call budget.
 */
export const PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE = 16;

export const peopleDashboardActivityInputSchema = Schema.Struct({
  personIds: Schema.mutable(
    Schema.Array(Schema.Trim.check(Schema.isMinLength(1)))
  )
    .check(Schema.isMinLength(1))
    .check(Schema.isMaxLength(PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE)),
}).mapFields(Struct.map(Schema.mutableKey));

export const peopleDashboardPersonInputSchema = Schema.Struct({
  ...peopleBlockoutsInputSchema.fields,
  month: Schema.optional(
    Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/u))
  ),
}).mapFields(Struct.map(Schema.mutableKey));

export const peopleMyScheduledPlansInputSchema = Schema.Struct({}).mapFields(
  Struct.map(Schema.mutableKey)
);

export const peopleSearchOutputSchema = Schema.mutable(
  Schema.Array(peopleSearchResultSchema)
);

export const peopleBlockoutsOutputSchema = Schema.mutable(
  Schema.Array(blockoutSchema)
);

export const peopleRpc = RpcGroup.make(
  Rpc.make("people.positionCandidates", {
    payload: peoplePositionCandidatesInputSchema,
    success: positionCandidatesSchema,
    error: RpcError,
  }),
  Rpc.make("people.planWindowHistory", {
    payload: peoplePlanWindowHistoryInputSchema,
    success: planWindowHistoryBatchSchema,
    error: RpcError,
  }),
  Rpc.make("people.candidateDetails", {
    payload: peopleCandidateDetailsInputSchema,
    success: candidateDetailsBatchSchema,
    error: RpcError,
  }),
  Rpc.make("people.search", {
    payload: peopleSearchInputSchema,
    success: peopleSearchOutputSchema,
    error: RpcError,
  }),
  Rpc.make("people.blockouts", {
    payload: peopleBlockoutsInputSchema,
    success: peopleBlockoutsOutputSchema,
    error: RpcError,
  }),
  Rpc.make("people.dashboardRoster", {
    payload: Schema.Struct({}),
    success: peopleDashboardRosterSchema,
    error: RpcError,
  }),
  Rpc.make("people.dashboardActivity", {
    payload: peopleDashboardActivityInputSchema,
    success: peopleDashboardActivityBatchSchema,
    error: RpcError,
  }),
  Rpc.make("people.dashboardPerson", {
    payload: peopleDashboardPersonInputSchema,
    success: peopleDashboardPersonDetailSchema,
    error: RpcError,
  }),
  Rpc.make("people.myScheduledPlans", {
    payload: peopleMyScheduledPlansInputSchema,
    success: myScheduledPlansDataSchema,
    error: RpcError,
  })
);

export type PeoplePositionCandidatesInput =
  typeof peoplePositionCandidatesInputSchema.Encoded;

export type PeoplePlanWindowHistoryInput =
  typeof peoplePlanWindowHistoryInputSchema.Encoded;

export type PeopleCandidateDetailsInput =
  typeof peopleCandidateDetailsInputSchema.Encoded;

export type PeopleSearchInput = typeof peopleSearchInputSchema.Encoded;

export type PeopleBlockoutsInput = typeof peopleBlockoutsInputSchema.Encoded;

export type PeopleDashboardActivityInput =
  typeof peopleDashboardActivityInputSchema.Encoded;

export type PeopleDashboardPersonInput =
  typeof peopleDashboardPersonInputSchema.Encoded;
