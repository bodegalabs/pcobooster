/** Needed position procedures over Effect RPC. Ported from the zod schemas in `../needed-positions.ts`. */
import { planningCenterGroup } from "@pcobooster/contracts/rpc/group";
import { write } from "@pcobooster/contracts/rpc/procedure";
import {
  nonNegativeInteger,
  requiredId,
} from "@pcobooster/contracts/rpc/schema";
import { Schema } from "effect";

export const neededPositionsAdjustInputSchema = Schema.Struct({
  serviceTypeId: requiredId,
  planId: requiredId,
  teamId: requiredId,
  positionName: requiredId,
  change: Schema.Literals(["add", "remove"]),
});

/** The position's open slots after the change; unchanged when it had no open-slot record. */
export const neededPositionsAdjustOutputSchema = Schema.Struct({
  openCount: nonNegativeInteger,
});

export const neededPositionsAdjust = write("neededPositions.adjust", {
  payload: neededPositionsAdjustInputSchema,
  success: neededPositionsAdjustOutputSchema,
});

export const neededPositionsProcedures = [neededPositionsAdjust] as const;
export const neededPositionsRpc = planningCenterGroup(
  ...neededPositionsProcedures
);
