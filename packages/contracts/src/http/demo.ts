/** The read-only demo session. */
import { write } from "@pcobooster/contracts/http/endpoint";
import { plainGroup } from "@pcobooster/contracts/http/group";
import { Schema } from "effect";

export const demoStartInputSchema = Schema.Struct({
  key: Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
});

export const demoSessionSchema = Schema.Struct({ demo: Schema.Boolean });

export const demo = plainGroup(
  "demo",
  /** Sets the demo session cookie. */
  write.post("demo.start", "/demo/session", {
    params: {},
    payload: demoStartInputSchema.fields,
    success: demoSessionSchema,
  }),
  /** Expires the demo session cookie. */
  write.delete("demo.exit", "/demo/session", {
    params: {},
    query: {},
    success: demoSessionSchema,
  })
);
