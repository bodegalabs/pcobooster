import type { RequestContext } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import { requireFeatureFlag } from "@pcobooster/api/application/feature-flags";
import {
  PlanningCenterAccess,
  withPlanningCenterFaults,
} from "@pcobooster/api/application/planning-center-access";
import { getSongLibrary } from "@pcobooster/api/modules/planning-center/song-library";
import type { Server } from "@pcobooster/api/server";
import type { SongLibrary } from "@pcobooster/contracts/songs";
import { Effect } from "effect";

/** The Songs page's library; it exists only where the `chordCharts` flag is on. */
export const readSongLibrary = (): Effect.Effect<
  SongLibrary,
  ApplicationFault,
  PlanningCenterAccess | RequestContext | Server
> =>
  Effect.gen(function* readLibrary() {
    const access = yield* PlanningCenterAccess;
    yield* requireFeatureFlag(access, "chordCharts");
    return yield* getSongLibrary({
      cacheScope: access.cacheScope,
      songsService: access.services.songs,
    });
  }).pipe(withPlanningCenterFaults);
