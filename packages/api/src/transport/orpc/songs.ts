import {
  getRunSheetSongOptions,
  searchRunSheetSongs,
} from "@pcobooster/api/application/run-sheet";
import { rpc } from "@pcobooster/api/transport/orpc/implementation";
import { readWithPlanningCenter } from "@pcobooster/api/transport/orpc/planning-center-procedure";

const search = rpc.songs.search.handler(
  async ({ input, ...call }) =>
    await readWithPlanningCenter(searchRunSheetSongs(input), call)
);

const options = rpc.songs.options.handler(
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getRunSheetSongOptions(input), call)
);

export const songsRouter = {
  search,
  options,
};
