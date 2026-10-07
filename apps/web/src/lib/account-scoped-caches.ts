import { ACCOUNT_PANEL_CACHE_KEY } from "@/lib/account-panel-cache";
import { readBrowserStorage, writeBrowserStorage } from "@/lib/browser-storage";
import { clearChordChartDrafts } from "@/lib/chord-chart-draft";
import { clearCachedMyScheduledPlans } from "@/lib/my-scheduled-plans-cache";
import { clearCachedOrganizationTimeZone } from "@/lib/organization-time-zone-cache";
import { clearCachedPeopleDashboards } from "@/lib/people-dashboard-cache";
import { clearCachedPeopleSearch } from "@/lib/people-search-cache";
import { clearCachedPlanItems } from "@/lib/plan-items-cache";
import { clearCachedPositionCandidates } from "@/lib/position-candidates-cache";
import { clearRecentSongs } from "@/lib/recent-songs";
import { clearCachedScheduleCatalog } from "@/lib/schedule-catalog-cache";
import { clearCachedSongOptions } from "@/lib/song-options-cache";
import { clearCachedSongSearch } from "@/lib/song-search-cache";
import { clearCachedTeamPositions } from "@/lib/team-positions-cache";

/** Forgets every saved API answer; what the person wrote or chose stays. */
const clearCachedApiAnswers = (): void => {
  writeBrowserStorage(ACCOUNT_PANEL_CACHE_KEY, null);
  clearCachedPositionCandidates();
  clearCachedPeopleDashboards();
  clearCachedPeopleSearch();
  clearCachedMyScheduledPlans();
  clearCachedOrganizationTimeZone();
  clearCachedPlanItems();
  clearCachedScheduleCatalog();
  clearCachedSongOptions();
  clearCachedSongSearch();
  clearCachedTeamPositions();
};

/** Forgets browser data saved for one organization before showing another. */
export const clearAccountScopedCaches = (): void => {
  clearCachedApiAnswers();
  clearRecentSongs();
  clearChordChartDrafts();
};

/**
 * Raise when the API's answers change shape or transport, so answers saved by an older build
 * are dropped instead of shown. 3: answers come from the HttpApi client (`/api/v1`).
 */
const API_CACHE_GENERATION = "3";
const API_CACHE_GENERATION_KEY = "pcobooster:api-cache-generation";

/** Drops API answers an older build saved; drafts and recent songs survive. Runs at startup. */
export const discardApiCachesFromOlderBuilds = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  if (readBrowserStorage(API_CACHE_GENERATION_KEY) === API_CACHE_GENERATION) {
    return;
  }
  clearCachedApiAnswers();
  writeBrowserStorage(API_CACHE_GENERATION_KEY, API_CACHE_GENERATION);
};
