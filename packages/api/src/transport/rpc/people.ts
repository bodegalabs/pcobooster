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
import { defineHandler } from "@pcobooster/api/transport/rpc/implementation";
import { readWithPlanningCenter } from "@pcobooster/api/transport/rpc/planning-center-procedure";

const positionCandidates = defineHandler(
  "people.positionCandidates",
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getPeoplePositionCandidates(input), call)
);

const planWindowHistory = defineHandler(
  "people.planWindowHistory",
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getPeoplePlanWindowHistory(input), call)
);

const candidateDetails = defineHandler(
  "people.candidateDetails",
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getPeopleCandidateDetails(input), call)
);

const search = defineHandler(
  "people.search",
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getPeopleSearch(input), call)
);

const blockouts = defineHandler(
  "people.blockouts",
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getPeopleBlockouts(input), call)
);

const dashboardRoster = defineHandler(
  "people.dashboardRoster",
  async (call) => await readWithPlanningCenter(getPeopleDashboardRoster(), call)
);

const dashboardActivity = defineHandler(
  "people.dashboardActivity",
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getPeopleDashboardActivity(input), call)
);

const dashboardPerson = defineHandler(
  "people.dashboardPerson",
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getPeopleDashboardPerson(input), call)
);

const myScheduledPlans = defineHandler(
  "people.myScheduledPlans",
  async (call) => await readWithPlanningCenter(getMyScheduledPlans(), call)
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
