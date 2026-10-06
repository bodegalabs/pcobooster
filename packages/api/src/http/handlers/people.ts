import {
  getMyScheduledPlans,
  getPeopleBlockouts,
  getPeopleCandidateDetails,
  getPeopleDashboardActivity,
  getPeopleDashboardPerson,
  getPeopleDashboardRoster,
  getPeoplePlanWindowHistory,
  getPeoplePositionCandidates,
  getPeopleSearch,
} from "@pcobooster/api/application/people";
import { ProductApi } from "@pcobooster/contracts/http/api";
import { HttpApiBuilder } from "effect/unstable/httpapi";

export const PeopleHandlers = HttpApiBuilder.group(
  ProductApi,
  "people",
  (handlers) =>
    handlers
      .handle("people.positionCandidates", ({ params, query }) =>
        getPeoplePositionCandidates({ ...params, ...query })
      )
      .handle("people.planWindowHistory", ({ payload }) =>
        getPeoplePlanWindowHistory(payload)
      )
      .handle("people.candidateDetails", ({ params, payload }) =>
        getPeopleCandidateDetails({ ...params, ...payload })
      )
      .handle("people.search", ({ query }) => getPeopleSearch(query))
      .handle("people.blockouts", ({ params }) => getPeopleBlockouts(params))
      .handle("people.dashboardRoster", () => getPeopleDashboardRoster())
      .handle("people.dashboardActivity", ({ query }) =>
        getPeopleDashboardActivity(query)
      )
      .handle("people.dashboardPerson", ({ params, query }) =>
        getPeopleDashboardPerson({ ...params, ...query })
      )
      .handle("people.myScheduledPlans", () => getMyScheduledPlans())
);
