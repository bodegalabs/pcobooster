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

export type NeededPositionsAdjustInput = z.input<
  typeof neededPositionsAdjustInputSchema
>;
