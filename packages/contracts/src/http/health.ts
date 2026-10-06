/** Liveness through the whole product API; the deploy check reads `version`. */
import { read } from "@pcobooster/contracts/http/endpoint";
import { plainGroup } from "@pcobooster/contracts/http/group";
import { healthOutputSchema } from "@pcobooster/contracts/rpc/product";

export const health = plainGroup(
  "health",
  read("health", "/health", {
    params: {},
    query: {},
    success: healthOutputSchema,
  })
);
