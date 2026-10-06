/** Demo session procedures over Effect RPC. Ported from the zod schemas in `../demo.ts`. */
import { plainGroup } from "@pcobooster/contracts/rpc/group";
import { write } from "@pcobooster/contracts/rpc/procedure";
import { Schema } from "effect";

export const demoStartInputSchema = Schema.Struct({
  key: Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
});

export const demoSessionSchema = Schema.Struct({ demo: Schema.Boolean });

/** Sets the demo session cookie. */
export const demoStart = write("demo.start", {
  payload: demoStartInputSchema,
  success: demoSessionSchema,
});

/** Expires the demo session cookie. */
export const demoExit = write("demo.exit", {
  payload: Schema.Struct({}),
  success: demoSessionSchema,
});

export const demoProcedures = [demoStart, demoExit] as const;
export const demoSessionRpc = plainGroup(...demoProcedures);
