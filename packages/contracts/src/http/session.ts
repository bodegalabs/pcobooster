/** Whether the caller is signed in. */
import { read } from "@pcobooster/contracts/http/endpoint";
import { plainGroup } from "@pcobooster/contracts/http/group";
import { sessionStatusSchema } from "@pcobooster/contracts/rpc/session";

export const session = plainGroup(
  "session",
  read("session.status", "/session", {
    params: {},
    query: {},
    success: sessionStatusSchema,
  })
);
