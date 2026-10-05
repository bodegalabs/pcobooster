import {
  getRunSheetSongHistory,
  getRunSheetSongOptions,
  searchRunSheetSongs,
  suggestRunSheetSongs,
} from "@pcobooster/api/application/run-sheet";
import { readSongLibrary } from "@pcobooster/api/application/song-library";
import { defineHandler } from "@pcobooster/api/transport/rpc/implementation";
import { readWithPlanningCenter } from "@pcobooster/api/transport/rpc/planning-center-procedure";

const search = defineHandler(
  "songs.search",
  async ({ input, ...call }) =>
    await readWithPlanningCenter(searchRunSheetSongs(input), call)
);

const suggestions = defineHandler(
  "songs.suggestions",
  async (call) => await readWithPlanningCenter(suggestRunSheetSongs(), call)
);

const library = defineHandler(
  "songs.library",
  async (call) => await readWithPlanningCenter(readSongLibrary(), call)
);

const history = defineHandler(
  "songs.history",
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getRunSheetSongHistory(input), call)
);

const options = defineHandler(
  "songs.options",
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getRunSheetSongOptions(input), call)
);

export const songsRouter = {
  search,
  suggestions,
  library,
  history,
  options,
};
