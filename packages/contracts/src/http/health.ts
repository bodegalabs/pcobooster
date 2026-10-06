/** Liveness through the whole product API; the deploy check reads `version`. */
import { read } from "@pcobooster/contracts/http/endpoint";
import { plainGroup } from "@pcobooster/contracts/http/group";
import { Schema } from "effect";

export const healthOutputSchema = Schema.Struct({
  status: Schema.Literal("ok"),
  version: Schema.String,
});

export const health = plainGroup(
  "health",
  read("get", "/health", {
    success: healthOutputSchema,
  })
);
