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
import { withPlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import { executeApplicationEffect } from "@pcobooster/api/transport/orpc/execute";
import {
  applicationRuntime,
  rpc,
} from "@pcobooster/api/transport/orpc/implementation";

const positionCandidates = rpc.people.positionCandidates.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getPeoplePositionCandidates(input)),
      context,
      signal
    )
);

const planWindowHistory = rpc.people.planWindowHistory.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getPeoplePlanWindowHistory(input)),
      context,
      signal
    )
);

const candidateDetails = rpc.people.candidateDetails.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getPeopleCandidateDetails(input)),
      context,
      signal
    )
);

const search = rpc.people.search.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getPeopleSearch(input)),
      context,
      signal
    )
);

const blockouts = rpc.people.blockouts.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getPeopleBlockouts(input)),
      context,
      signal
    )
);

const dashboardRoster = rpc.people.dashboardRoster.handler(
  async ({ context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getPeopleDashboardRoster()),
      context,
      signal
    )
);

const dashboardActivity = rpc.people.dashboardActivity.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getPeopleDashboardActivity(input)),
      context,
      signal
    )
);

const dashboardPerson = rpc.people.dashboardPerson.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getPeopleDashboardPerson(input)),
      context,
      signal
    )
);

const myScheduledPlans = rpc.people.myScheduledPlans.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getMyScheduledPlans(input)),
      context,
      signal
    )
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
