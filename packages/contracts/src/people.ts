import { oc } from "@orpc/contract";
import { applicationErrorMap } from "@worship-admin/contracts/errors";
import {
  blockoutSchema,
  myScheduledPlansDataSchema,
  peopleDashboardDataSchema,
  peopleDashboardPersonDetailSchema,
  peopleDashboardRangeSchema,
  peopleSearchResultSchema,
  personWithAvailabilitySchema,
  scheduleHistoryResponseSchema,
} from "@worship-admin/contracts/people-schemas";
import { z } from "zod";

export const peopleListInputSchema = z.object({
  serviceTypeId: z.string().trim().min(1),
  positionId: z.string().trim().min(1),
  teamId: z.string().trim().min(1).optional(),
  planId: z.string().trim().min(1).optional(),
  date: z.string().min(1).optional(),
});

export const peopleSearchInputSchema = z.object({
  query: z.string().trim().min(2).max(80),
});

export const peopleWarmupInputSchema = z.object({
  serviceTypeId: z.string().trim().min(1),
  date: z.string().min(1),
});

export const peopleBlockoutsInputSchema = z.object({
  personId: z.string().trim().min(1),
});

export const peopleDashboardInputSchema = z.object({
  range: peopleDashboardRangeSchema,
});

export const peopleDashboardPersonInputSchema =
  peopleBlockoutsInputSchema.extend({
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/u)
      .optional(),
  });

export const peopleScheduleHistoryInputSchema =
  peopleBlockoutsInputSchema.extend({
    days: z.number().int().positive(),
  });

export const peopleMyScheduledPlansInputSchema = z.object({
  planIds: z.array(z.string().min(1)).max(500),
});

export const peopleListOutputSchema = z.array(personWithAvailabilitySchema);
export const peopleSearchOutputSchema = z.array(peopleSearchResultSchema);
export const peopleWarmupOutputSchema = z.object({ warmed: z.literal(true) });
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
  list: peopleProcedure
    .route({
      method: "GET",
      path: "/people",
      summary: "List people available for a team position",
    })
    .input(peopleListInputSchema)
    .output(peopleListOutputSchema),
  search: peopleProcedure
    .route({
      method: "GET",
      path: "/people/search",
      summary: "Search the people directory",
    })
    .input(peopleSearchInputSchema)
    .output(peopleSearchOutputSchema),
  warmup: peopleProcedure
    .route({
      method: "POST",
      path: "/people/warmup",
      summary: "Warm people history for a plan date",
    })
    .input(peopleWarmupInputSchema)
    .output(peopleWarmupOutputSchema),
  blockouts: peopleProcedure
    .route({
      method: "GET",
      path: "/people/{personId}/blockouts",
      summary: "List a person's future blockouts",
    })
    .input(peopleBlockoutsInputSchema)
    .output(peopleBlockoutsOutputSchema),
  dashboard: dashboardProcedure
    .route({
      method: "GET",
      path: "/people/dashboard",
      summary: "Read the people activity dashboard",
    })
    .input(peopleDashboardInputSchema)
    .output(peopleDashboardDataSchema),
  dashboardPerson: dashboardProcedure
    .route({
      method: "GET",
      path: "/people/dashboard/{personId}",
      summary: "Read a person's monthly activity",
    })
    .input(peopleDashboardPersonInputSchema)
    .output(peopleDashboardPersonDetailSchema),
  scheduleHistory: peopleProcedure
    .route({
      method: "GET",
      path: "/people/{personId}/schedule-history",
      summary: "Read a person's schedule history and frequency",
    })
    .input(peopleScheduleHistoryInputSchema)
    .output(scheduleHistoryResponseSchema),
  myScheduledPlans: peopleProcedure
    .route({
      method: "POST",
      path: "/people/my-scheduled-plans",
      summary: "Find requested plans assigned to the current person",
    })
    .input(peopleMyScheduledPlansInputSchema)
    .output(myScheduledPlansDataSchema),
};

export type PeopleListInput = z.input<typeof peopleListInputSchema>;
export type PeopleSearchInput = z.input<typeof peopleSearchInputSchema>;
export type PeopleWarmupInput = z.input<typeof peopleWarmupInputSchema>;
export type PeopleBlockoutsInput = z.input<typeof peopleBlockoutsInputSchema>;
export type PeopleDashboardInput = z.input<typeof peopleDashboardInputSchema>;
export type PeopleDashboardPersonInput = z.input<
  typeof peopleDashboardPersonInputSchema
>;
export type PeopleScheduleHistoryInput = z.input<
  typeof peopleScheduleHistoryInputSchema
>;
export type PeopleMyScheduledPlansInput = z.input<
  typeof peopleMyScheduledPlansInputSchema
>;
