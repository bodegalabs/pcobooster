import { oc } from "@orpc/contract";
import { applicationErrorMap } from "@pcobooster/contracts/errors";
import { z } from "zod";

const requiredId = z.string().trim().min(1);

export const neededPositionsAdjustInputSchema = z.object({
  serviceTypeId: requiredId,
  planId: requiredId,
  teamId: requiredId,
  positionName: z.string().trim().min(1),
  change: z.enum(["add", "remove"]),
});

/** The position's open slots after the change; unchanged when it had no open-slot record. */
export const neededPositionsAdjustOutputSchema = z.object({
  openCount: z.number().int().nonnegative(),
});

const neededPositionsProcedure = oc.errors({
  UNAUTHORIZED: applicationErrorMap.UNAUTHORIZED,
  FORBIDDEN: applicationErrorMap.FORBIDDEN,
  TOO_MANY_REQUESTS: applicationErrorMap.TOO_MANY_REQUESTS,
  BAD_GATEWAY: applicationErrorMap.BAD_GATEWAY,
  INTERNAL_SERVER_ERROR: applicationErrorMap.INTERNAL_SERVER_ERROR,
});

export const neededPositionsContract = {
  adjust: neededPositionsProcedure
    .route({
      method: "POST",
      path: "/plans/{planId}/needed-positions/adjust",
      summary: "Add or remove one open slot for a position on a plan",
    })
    .input(neededPositionsAdjustInputSchema)
    .output(neededPositionsAdjustOutputSchema),
};

export type NeededPositionsAdjustInput = z.input<
  typeof neededPositionsAdjustInputSchema
>;
