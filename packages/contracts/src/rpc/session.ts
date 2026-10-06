/** Session procedures over Effect RPC. Ported from the zod schemas in `../session.ts`. */
import { plainGroup } from "@pcobooster/contracts/rpc/group";
import { read } from "@pcobooster/contracts/rpc/procedure";
import { Schema } from "effect";

export const sessionStatusSchema = Schema.Struct({
  authenticated: Schema.Boolean,
});

export const sessionStatus = read("session.status", {
  payload: Schema.Struct({}),
  success: sessionStatusSchema,
});

export const sessionProcedures = [sessionStatus] as const;
export const sessionRpc = plainGroup(...sessionProcedures);
