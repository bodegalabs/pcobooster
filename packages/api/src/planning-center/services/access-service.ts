import type {
  PlanningCenterCoreClient,
  PlanningCenterError,
} from "@pcobooster/api/planning-center/core-client";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

/** The signed-in person's own records, which carry their permissions in each product. */
export class PlanningCenterAccessService {
  private readonly core: PlanningCenterCoreClient;

  constructor(core: PlanningCenterCoreClient) {
    this.core = core;
  }

  /** Services `Person` for the token's owner; 401 or 403 without Services access. */
  getServicesMe(): Effect.Effect<PCResource, PlanningCenterError> {
    return Effect.map(
      this.core.fetch("/services/v2/me"),
      (response) => response.data
    );
  }

  /** The teams a Services person leads (`TeamLeader` records). */
  getTeamLeaders(
    personId: string
  ): Effect.Effect<PCResource[], PlanningCenterError> {
    return this.core.fetchAll(
      `/services/v2/people/${encodeURIComponent(personId)}/team_leaders`,
      {},
      2
    );
  }

  /**
   * One person from the People directory, the list people search reads; 401 or 403 when
   * the person can't search it. Services editors can, even without the People app.
   */
  probePeopleDirectory(): Effect.Effect<PCResource[], PlanningCenterError> {
    return Effect.map(
      this.core.fetchCollection("/people/v2/people?per_page=1"),
      (response) => response.data
    );
  }
}
