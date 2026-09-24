import {
  getMyScheduledPlans,
  getPeopleBlockouts,
  getPeopleCandidateDetails,
  getPeoplePlanWindowHistory,
  getPeoplePositionCandidates,
  getPeopleDashboardActivity,
  getPeopleDashboardPerson,
  getPeopleDashboardRoster,
  getPeopleSearch,
} from "@pcobooster/api/application/people";
import { rpc } from "@pcobooster/api/transport/orpc/implementation";
import { readWithPlanningCenter } from "@pcobooster/api/transport/orpc/planning-center-procedure";

const positionCandidates = rpc.people.positionCandidates.handler(
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getPeoplePositionCandidates(input), call)
);

const planWindowHistory = rpc.people.planWindowHistory.handler(
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getPeoplePlanWindowHistory(input), call)
);

const candidateDetails = rpc.people.candidateDetails.handler(
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getPeopleCandidateDetails(input), call)
);

const search = rpc.people.search.handler(
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getPeopleSearch(input), call)
);

const blockouts = rpc.people.blockouts.handler(
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getPeopleBlockouts(input), call)
);

const dashboardRoster = rpc.people.dashboardRoster.handler(
  async (call) => await readWithPlanningCenter(getPeopleDashboardRoster(), call)
);

const dashboardActivity = rpc.people.dashboardActivity.handler(
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getPeopleDashboardActivity(input), call)
);

const dashboardPerson = rpc.people.dashboardPerson.handler(
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getPeopleDashboardPerson(input), call)
);

const myScheduledPlans = rpc.people.myScheduledPlans.handler(
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getMyScheduledPlans(input), call)
);

export const peopleRouter = {
  positionCandidates,
  planWindowHistory,
  candidateDetails,
  search,
  blockouts,
  dashboardRoster,
  dashboardActivity,
  dashboardPerson,
  myScheduledPlans,
};
