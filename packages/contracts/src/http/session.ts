/** Whether the caller is signed in. */
import { read } from "@pcobooster/contracts/http/endpoint";
import { plainGroup } from "@pcobooster/contracts/http/group";
import { Schema } from "effect";

export const sessionStatusSchema = Schema.Struct({
  authenticated: Schema.Boolean,
});

export const session = plainGroup(
  "session",
  read("status", "/session", {
    success: sessionStatusSchema,
  })
);
