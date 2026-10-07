import {
  blockoutSchema,
  candidateDetailsContinuationSchema,
  candidatePersonProgressSchema,
  planTimesProgressSchema,
  peopleSearchResultSchema,
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
 * plus one page per repeating blockout near the plan date (more for long
 * lists), so a full batch usually fits one call; the rest continues.
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
  /** From the previous call's `continuation`; omit on the first call. */
  continuation: candidateDetailsContinuationSchema
    .extend({
      people: z
        .array(candidatePersonProgressSchema)
        .max(PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE),
    })
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
    /** From the previous call's `continuation`; omit on the first call. */
    continuation: planTimesProgressSchema.optional(),
  });

export const peopleMyScheduledPlansInputSchema = z.object({});

export const peopleSearchOutputSchema = z.array(peopleSearchResultSchema);
export const peopleBlockoutsOutputSchema = z.array(blockoutSchema);

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
