import type { DemoOrganization } from "@pcobooster/api/modules/demo/get-demo-organization";
import type { PeopleDashboardPersonDetail } from "@pcobooster/api/modules/planning-center/people-dashboard-types";
import type { SongSearchResultCache } from "@pcobooster/api/modules/planning-center/search-songs";
import { PlanningCenterReadCache } from "@pcobooster/api/planning-center/services/read-cache";

/**
 * Caches of values feature modules derive from Planning Center reads, one set per Worker
 * isolate. `createServerDependencies` creates them next to the service read caches; every
 * key starts with the credential's cache scope, so no entry is shared across credentials.
 */
export interface ModuleReadCaches {
  /** The demo organization's id and name, which label the demo account menu. */
  readonly demoOrganization: PlanningCenterReadCache<DemoOrganization>;
  /** A person's dashboard page for one month and organization zone. */
  readonly peopleDashboardPerson: PlanningCenterReadCache<PeopleDashboardPersonDetail>;
  /** The organization id that seeds presentation-mode aliases. */
  readonly presentationOrganizationIds: PlanningCenterReadCache<string>;
  /** Ranked song search results by normalized query. */
  readonly songSearchResults: SongSearchResultCache;
}

export const createModuleReadCaches = (): ModuleReadCaches => ({
  demoOrganization: new PlanningCenterReadCache<DemoOrganization>(),
  peopleDashboardPerson:
    new PlanningCenterReadCache<PeopleDashboardPersonDetail>(),
  presentationOrganizationIds: new PlanningCenterReadCache<string>(),
  songSearchResults: new Map(),
});
