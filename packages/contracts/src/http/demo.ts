/** The read-only demo session. */
import { write } from "@pcobooster/contracts/http/endpoint";
import { plainGroup } from "@pcobooster/contracts/http/group";
import {
  demoSessionSchema,
  demoStartInputSchema,
} from "@pcobooster/contracts/rpc/demo";

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
