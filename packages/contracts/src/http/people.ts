/** Candidates, availability, schedule history, and the People dashboard. */
import { read } from "@pcobooster/contracts/http/endpoint";
import { planningCenterGroup } from "@pcobooster/contracts/http/group";
import {
  peopleBlockoutsInputSchema,
  peopleCandidateDetailsInputSchema,
  peopleDashboardActivityInputSchema,
  peopleDashboardPersonInputSchema,
  peoplePlanWindowHistoryInputSchema,
  peoplePositionCandidatesInputSchema,
  peopleSearchInputSchema,
} from "@pcobooster/contracts/rpc/people";
import {
  blockoutSchema,
  candidateDetailsBatchSchema,
  myScheduledPlansDataSchema,
  peopleDashboardActivityBatchSchema,
  peopleDashboardPersonDetailSchema,
  peopleDashboardRosterSchema,
  peopleSearchResultSchema,
  planWindowHistoryBatchSchema,
  positionCandidatesSchema,
} from "@pcobooster/contracts/rpc/people-schemas";
import { mutableArray } from "@pcobooster/contracts/rpc/schema";
import { Struct } from "effect";

const CANDIDATE_POSITION = ["serviceTypeId", "planId", "positionId"] as const;

export const people = planningCenterGroup(
  "people",
  read(
    "people.positionCandidates",
    "/service-types/:serviceTypeId/plans/:planId/positions/:positionId/candidates",
    {
      params: Struct.pick(
        peoplePositionCandidatesInputSchema.fields,
        CANDIDATE_POSITION
      ),
      query: Struct.omit(
        peoplePositionCandidatesInputSchema.fields,
        CANDIDATE_POSITION
      ),
      success: positionCandidatesSchema,
    }
  ),
  /**
   * Partial with a continuation cursor: pass `deferredPlans` and the ids back as `continuation`.
   * A POST read: the cursor can outgrow a URL.
   */
  read.post("people.planWindowHistory", "/people/plan-window-history", {
    params: {},
    payload: peoplePlanWindowHistoryInputSchema.fields,
    success: planWindowHistoryBatchSchema,
  }),
  /**
   * Partial with a continuation cursor: `deferredPersonIds` and `blockoutProgress`. A POST read:
   * the people and their blockout progress can outgrow a URL.
   */
  read.post("people.candidateDetails", "/plans/:planId/candidate-details", {
    params: Struct.pick(peopleCandidateDetailsInputSchema.fields, ["planId"]),
    payload: Struct.omit(peopleCandidateDetailsInputSchema.fields, ["planId"]),
    success: candidateDetailsBatchSchema,
  }),
  read("people.search", "/people", {
    params: {},
    query: peopleSearchInputSchema.fields,
    success: mutableArray(peopleSearchResultSchema),
  }),
  read("people.blockouts", "/people/:personId/blockouts", {
    params: peopleBlockoutsInputSchema.fields,
    query: {},
    success: mutableArray(blockoutSchema),
  }),
  read("people.dashboardRoster", "/people/roster", {
    params: {},
    query: {},
    success: peopleDashboardRosterSchema,
    feature: "people",
  }),
  /** Partial with a continuation cursor: `deferredPersonIds`. */
  read("people.dashboardActivity", "/people/activity", {
    params: {},
    query: peopleDashboardActivityInputSchema.fields,
    success: peopleDashboardActivityBatchSchema,
    feature: "people",
  }),
  /** Partial without a cursor: `requestBudget.unresolvedRehearsalTimes` says what is missing. */
  read("people.dashboardPerson", "/people/:personId/dashboard", {
    params: Struct.pick(peopleDashboardPersonInputSchema.fields, ["personId"]),
    query: Struct.omit(peopleDashboardPersonInputSchema.fields, ["personId"]),
    success: peopleDashboardPersonDetailSchema,
    feature: "people",
  }),
  read("people.myScheduledPlans", "/me/scheduled-plans", {
    params: {},
    query: {},
    success: myScheduledPlansDataSchema,
  })
);
