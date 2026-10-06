/** What the caller may do in Planning Center. */
import { read } from "@pcobooster/contracts/http/endpoint";
import { planningCenterGroup } from "@pcobooster/contracts/http/group";
import { accessSnapshotSchema } from "@pcobooster/contracts/rpc/access";

export const access = planningCenterGroup(
  "access",
  read("access.me", "/access/me", {
    params: {},
    query: {},
    success: accessSnapshotSchema,
  })
);
