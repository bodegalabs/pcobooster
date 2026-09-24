import { ACCOUNT_PANEL_CACHE_KEY } from "@/lib/account-panel-cache";
import { writeBrowserStorage } from "@/lib/browser-storage";
import { clearCachedMyScheduledPlans } from "@/lib/my-scheduled-plans-cache";
import { clearCachedOrganizationTimeZone } from "@/lib/organization-time-zone-cache";
import { clearCachedPeopleDashboards } from "@/lib/people-dashboard-cache";
import { clearCachedPeopleSearch } from "@/lib/people-search-cache";
import { clearCachedPlanItems } from "@/lib/plan-items-cache";
import { clearCachedPositionCandidates } from "@/lib/position-candidates-cache";
import { clearCachedScheduleCatalog } from "@/lib/schedule-catalog-cache";
import { clearCachedSongOptions } from "@/lib/song-options-cache";
import { clearCachedSongSearch } from "@/lib/song-search-cache";
import { clearCachedTeamPositions } from "@/lib/team-positions-cache";

/** Forgets browser data saved for one organization before showing another. */
export const clearAccountScopedCaches = (): void => {
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
