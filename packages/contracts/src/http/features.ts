/** Which feature flags are on for this visitor. */
import { read } from "@pcobooster/contracts/http/endpoint";
import { plainGroup } from "@pcobooster/contracts/http/group";
import { enabledFeaturesSchema } from "@pcobooster/contracts/rpc/features";

export const features = plainGroup(
  "features",
  read("features.status", "/features", {
    params: {},
    query: {},
    success: enabledFeaturesSchema,
  })
);
