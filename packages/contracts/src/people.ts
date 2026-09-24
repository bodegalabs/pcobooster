import { oc } from "@orpc/contract";
import { applicationErrorMap } from "@pcobooster/contracts/errors";
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
import { z } from "zod";

export const peoplePositionCandidatesInputSchema = z.object({
  serviceTypeId: z.string().trim().min(1),
  positionId: z.string().trim().min(1),
  teamId: z.string().trim().min(1).optional(),
  planId: z.string().trim().min(1),
});

/** The selected plan's sort instant, as an ISO date-time. */
const planDateSchema = z.iso.datetime({ offset: true });

export const peoplePlanWindowHistoryInputSchema = z.object({
  date: planDateSchema,
  /** Where the previous call stopped; omit on the first call. */
  continuation: z
    .object({
      plans: z.array(windowPlanRefSchema).max(1000),
      serviceTypeIds: z.array(z.string().trim().min(1)).max(200),
    })
    .optional(),
});

/**
 * Candidates per `people.candidateDetails` call. Each costs one blockout page
 * plus one read per repeating blockout near the plan date, so a full batch
 * stays well under the per-call budget.
 */
export const PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE = 16;

export const peopleCandidateDetailsInputSchema = z.object({
  personIds: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE),
  planId: z.string().trim().min(1),
  date: planDateSchema,
  /** Also read each person's own schedules; only when the plan window is empty. */
  scheduleHistory: z.boolean(),
  /** From the previous call's `blockoutProgress`; omit on the first call. */
  blockoutProgress: z
    .array(blockoutProgressSchema)
    .max(PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE)
    .optional(),
});

export const peopleSearchInputSchema = z.object({
  query: z.string().trim().min(2).max(80),
});

export const peopleBlockoutsInputSchema = z.object({
  personId: z.string().trim().min(1),
});

/**
 * People per `people.dashboardActivity` call. Each person costs one schedule
 * page (two at most), so a full batch stays well under the per-call budget.
 */
export const PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE = 16;

export const peopleDashboardActivityInputSchema = z.object({
  personIds: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE),
});

export const peopleDashboardPersonInputSchema =
  peopleBlockoutsInputSchema.extend({
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/u)
      .optional(),
  });

export const peopleMyScheduledPlansInputSchema = z.object({
  planIds: z.array(z.string().min(1)).max(500),
});

export const peopleSearchOutputSchema = z.array(peopleSearchResultSchema);
export const peopleBlockoutsOutputSchema = z.array(blockoutSchema);

const peopleProcedure = oc.errors({
  UNAUTHORIZED: applicationErrorMap.UNAUTHORIZED,
  FORBIDDEN: applicationErrorMap.FORBIDDEN,
  TOO_MANY_REQUESTS: applicationErrorMap.TOO_MANY_REQUESTS,
  BAD_GATEWAY: applicationErrorMap.BAD_GATEWAY,
  INTERNAL_SERVER_ERROR: applicationErrorMap.INTERNAL_SERVER_ERROR,
});

const dashboardProcedure = peopleProcedure.errors({
  NOT_FOUND: applicationErrorMap.NOT_FOUND,
});

export const peopleContract = {
  positionCandidates: peopleProcedure
    .route({
      method: "GET",
      path: "/people/position-candidates",
      summary: "List candidates for a team position on a plan",
    })
    .input(peoplePositionCandidatesInputSchema)
    .output(positionCandidatesSchema),
  planWindowHistory: peopleProcedure
    .route({
      method: "POST",
      path: "/people/plan-window-history",
      summary: "Read serving history from rosters around a plan date",
    })
    .input(peoplePlanWindowHistoryInputSchema)
    .output(planWindowHistoryBatchSchema),
  candidateDetails: peopleProcedure
    .route({
      method: "POST",
      path: "/people/candidate-details",
      summary: "Read availability for a batch of candidates",
    })
    .input(peopleCandidateDetailsInputSchema)
    .output(candidateDetailsBatchSchema),
  search: peopleProcedure
    .route({
      method: "GET",
      path: "/people/search",
      summary: "Search the people directory",
    })
    .input(peopleSearchInputSchema)
    .output(peopleSearchOutputSchema),
  blockouts: peopleProcedure
    .route({
      method: "GET",
      path: "/people/{personId}/blockouts",
      summary: "List a person's future blockouts",
    })
    .input(peopleBlockoutsInputSchema)
    .output(peopleBlockoutsOutputSchema),
  dashboardRoster: dashboardProcedure
    .route({
      method: "GET",
      path: "/people/dashboard-roster",
      summary: "Read the People dashboard roster",
    })
    .output(peopleDashboardRosterSchema),
  dashboardActivity: dashboardProcedure
    .route({
      method: "POST",
      path: "/people/dashboard-activity",
      summary: "Read serving activity for a batch of roster people",
    })
    .input(peopleDashboardActivityInputSchema)
    .output(peopleDashboardActivityBatchSchema),
  dashboardPerson: dashboardProcedure
    .route({
      method: "GET",
      path: "/people/dashboard/{personId}",
      summary: "Read a person's monthly activity",
    })
    .input(peopleDashboardPersonInputSchema)
    .output(peopleDashboardPersonDetailSchema),
  myScheduledPlans: peopleProcedure
    .route({
      method: "POST",
      path: "/people/my-scheduled-plans",
      summary: "Find requested plans assigned to the current person",
    })
    .input(peopleMyScheduledPlansInputSchema)
    .output(myScheduledPlansDataSchema),
};

export type PeoplePositionCandidatesInput = z.input<
  typeof peoplePositionCandidatesInputSchema
>;
export type PeoplePlanWindowHistoryInput = z.input<
  typeof peoplePlanWindowHistoryInputSchema
>;
export type PeopleCandidateDetailsInput = z.input<
  typeof peopleCandidateDetailsInputSchema
>;
export type PeopleSearchInput = z.input<typeof peopleSearchInputSchema>;
export type PeopleBlockoutsInput = z.input<typeof peopleBlockoutsInputSchema>;
export type PeopleDashboardActivityInput = z.input<
  typeof peopleDashboardActivityInputSchema
>;
export type PeopleDashboardPersonInput = z.input<
  typeof peopleDashboardPersonInputSchema
>;
export type PeopleMyScheduledPlansInput = z.input<
  typeof peopleMyScheduledPlansInputSchema
>;
