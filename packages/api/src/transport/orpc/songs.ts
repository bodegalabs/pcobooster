import {
  getRunSheetSongHistory,
  getRunSheetSongOptions,
  searchRunSheetSongs,
  suggestRunSheetSongs,
} from "@pcobooster/api/application/run-sheet";
import { rpc } from "@pcobooster/api/transport/orpc/implementation";
import { readWithPlanningCenter } from "@pcobooster/api/transport/orpc/planning-center-procedure";

const search = rpc.songs.search.handler(
  async ({ input, ...call }) =>
    await readWithPlanningCenter(searchRunSheetSongs(input), call)
);

const suggestions = rpc.songs.suggestions.handler(
  async (call) => await readWithPlanningCenter(suggestRunSheetSongs(), call)
);

const history = rpc.songs.history.handler(
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getRunSheetSongHistory(input), call)
);

const options = rpc.songs.options.handler(
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getRunSheetSongOptions(input), call)
);

export const songsRouter = {
  search,
  suggestions,
  history,
  options,
};
