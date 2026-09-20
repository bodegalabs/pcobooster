import { withPlanningCenterAccess } from "@worship-admin/api/application/planning-center-access";
import {
  getRunSheetSongOptions,
  searchRunSheetSongs,
} from "@worship-admin/api/application/run-sheet";
import { executeApplicationEffect } from "@worship-admin/api/transport/orpc/execute";
import {
  applicationRuntime,
  rpc,
} from "@worship-admin/api/transport/orpc/implementation";

const search = rpc.songs.search.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(searchRunSheetSongs(input)),
      context,
      signal
    )
);

const options = rpc.songs.options.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getRunSheetSongOptions(input)),
      context,
      signal
    )
);

export const songsRouter = {
  search,
  options,
};
