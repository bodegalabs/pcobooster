import { oc } from "@orpc/contract";
import {
  applicationErrorMap,
  conflictErrorDataSchema,
} from "@pcobooster/contracts/errors";
import { z } from "zod";

const requiredId = z.string().trim().min(1);
const optionalId = requiredId.optional();

export const scheduleAssignInputSchema = z.object({
  serviceTypeId: requiredId,
  personId: requiredId,
  planId: requiredId,
  teamId: requiredId,
  positionId: requiredId,
  teamName: requiredId.optional(),
  positionName: requiredId.optional(),
  oneOff: z.boolean().default(false),
});

export const scheduleRemoveInputSchema = z.object({
  planPersonId: requiredId,
  serviceTypeId: optionalId,
  personId: optionalId,
  planId: optionalId,
});

export const scheduleUpdateStatusInputSchema = z.object({
  planPersonId: requiredId,
  status: z.enum(["C", "U", "D"]),
  serviceTypeId: optionalId,
  personId: optionalId,
  planId: optionalId,
});

export const scheduleAssignOutputSchema = z.object({
  success: z.literal(true),
  data: z.object({ id: requiredId }),
});

export const scheduleMutationOutputSchema = z.object({
  success: z.literal(true),
});

export const scheduleAlreadyScheduledErrorDataSchema = z.object({
  message: z.string(),
  details: z.string().optional(),
});

export const schedulePositionMismatchErrorDataSchema = z.object({
  message: z.string(),
  details: z.object({
    selected: z.object({
      teamId: requiredId,
      teamName: z.string(),
      positionId: requiredId,
      positionName: z.string(),
    }),
    created: z.object({
      planPersonId: requiredId,
      teamPositionName: z.string(),
    }),
  }),
});

const scheduleProcedure = oc.errors({
  UNAUTHORIZED: applicationErrorMap.UNAUTHORIZED,
  FORBIDDEN: applicationErrorMap.FORBIDDEN,
  BAD_REQUEST: applicationErrorMap.BAD_REQUEST,
  CONFLICT: {
    status: 409,
    data: conflictErrorDataSchema,
  },
  ALREADY_SCHEDULED: {
    status: 409,
    data: scheduleAlreadyScheduledErrorDataSchema,
  },
  POSITION_MISMATCH: {
    status: 409,
    data: schedulePositionMismatchErrorDataSchema,
  },
  TOO_MANY_REQUESTS: applicationErrorMap.TOO_MANY_REQUESTS,
  BAD_GATEWAY: applicationErrorMap.BAD_GATEWAY,
  INTERNAL_SERVER_ERROR: applicationErrorMap.INTERNAL_SERVER_ERROR,
});

export const scheduleContract = {
  assign: scheduleProcedure
    .route({
      method: "POST",
      path: "/schedule",
      summary: "Assign a person to a plan position",
    })
    .input(scheduleAssignInputSchema)
    .output(scheduleAssignOutputSchema),
  remove: scheduleProcedure
    .route({
      method: "DELETE",
      path: "/schedule/{planPersonId}",
      summary: "Remove a person from a plan",
    })
    .input(scheduleRemoveInputSchema)
    .output(scheduleMutationOutputSchema),
  updateStatus: scheduleProcedure
    .route({
      method: "PATCH",
      path: "/schedule/{planPersonId}/status",
      summary: "Update a person's schedule status",
    })
    .input(scheduleUpdateStatusInputSchema)
    .output(scheduleMutationOutputSchema),
};

export type ScheduleAssignInput = z.input<typeof scheduleAssignInputSchema>;
export type ScheduleRemoveInput = z.input<typeof scheduleRemoveInputSchema>;
export type ScheduleUpdateStatusInput = z.input<
  typeof scheduleUpdateStatusInputSchema
>;
export type ScheduleAssignOutput = z.output<typeof scheduleAssignOutputSchema>;
export type ScheduleMutationOutput = z.output<
  typeof scheduleMutationOutputSchema
>;
export type ScheduleAlreadyScheduledErrorData = z.output<
  typeof scheduleAlreadyScheduledErrorDataSchema
>;
export type SchedulePositionMismatchErrorData = z.output<
  typeof schedulePositionMismatchErrorDataSchema
>;
