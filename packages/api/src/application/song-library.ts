import type { ApplicationFault } from "@pcobooster/api/application/errors";
import {
  PlanningCenterAccess,
  withPlanningCenterFaults,
} from "@pcobooster/api/application/planning-center-access";
import { PlanningCenterSongs } from "@pcobooster/api/application/planning-center/songs";
import { getSongLibrary } from "@pcobooster/api/modules/planning-center/song-library";
import type { SongLibrary } from "@pcobooster/contracts/songs";
import { Effect } from "effect";

/** The Songs page's library; it exists only where the `chordCharts` flag is on. */
export const readSongLibrary = (): Effect.Effect<
  SongLibrary,
  ApplicationFault,
  PlanningCenterAccess | PlanningCenterSongs
> =>
  Effect.gen(function* readLibrary() {
    const access = yield* PlanningCenterAccess;
    const songsService = yield* PlanningCenterSongs;
    return yield* getSongLibrary({
      cacheScope: access.cacheScope,
      songsService,
    });
  }).pipe(withPlanningCenterFaults);
