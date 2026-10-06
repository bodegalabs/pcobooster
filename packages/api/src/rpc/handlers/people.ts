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
import { peopleRpc } from "@pcobooster/contracts/rpc/people";

export const PeopleHandlers = peopleRpc.toLayer({
  "people.positionCandidates": getPeoplePositionCandidates,
  // Reads `continuation` and answers the next one, unchanged by the transport.
  "people.planWindowHistory": getPeoplePlanWindowHistory,
  "people.candidateDetails": getPeopleCandidateDetails,
  "people.search": getPeopleSearch,
  "people.blockouts": getPeopleBlockouts,
  "people.dashboardRoster": () => getPeopleDashboardRoster(),
  "people.dashboardActivity": getPeopleDashboardActivity,
  "people.dashboardPerson": getPeopleDashboardPerson,
  "people.myScheduledPlans": () => getMyScheduledPlans(),
});
