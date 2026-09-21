import {
  getMyScheduledPlans,
  getPeopleBlockouts,
  getPeopleDashboard,
  getPeopleDashboardPerson,
  getPeopleList,
  getPeopleScheduleHistory,
  getPeopleSearch,
  warmPeople,
} from "@worship-admin/api/application/people";
import { withPlanningCenterAccess } from "@worship-admin/api/application/planning-center-access";
import { executeApplicationEffect } from "@worship-admin/api/transport/orpc/execute";
import {
  applicationRuntime,
  rpc,
} from "@worship-admin/api/transport/orpc/implementation";

const list = rpc.people.list.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getPeopleList(input)),
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

const warmup = rpc.people.warmup.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(warmPeople(input)),
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

const dashboard = rpc.people.dashboard.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getPeopleDashboard(input)),
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

const scheduleHistory = rpc.people.scheduleHistory.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getPeopleScheduleHistory(input)),
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
  list,
  search,
  warmup,
  blockouts,
  dashboard,
  dashboardPerson,
  scheduleHistory,
  myScheduledPlans,
};
