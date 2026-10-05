import type { PlanningCenterAccessDependencies } from "@pcobooster/api/application/planning-center-access";
import type { ActivityEventInput } from "@pcobooster/api/db/activity-events";
import {
  createPlanningCenterServices,
  createPlanningCenterReadCaches,
} from "@pcobooster/api/planning-center/services/factory";
import { unreachableHttpClient } from "@pcobooster/api/testing/http-client";
import { testRuntime } from "@pcobooster/api/testing/runtime";
import { testServer } from "@pcobooster/api/testing/server";
import { createScheduleRouter } from "@pcobooster/api/transport/rpc/schedule";
import { Effect } from "effect";
import { vi } from "vitest";

export const teamPositions = () => ({
  data: [
    {
      id: "position-1",
      type: "TeamPosition",
      attributes: { name: "Vocals" },
      relationships: { team: { data: { id: "team-1", type: "Team" } } },
    },
  ],
  included: [{ id: "team-1", type: "Team", attributes: { name: "Band" } }],
});

export const setupSyntheticSchedule = () => {
  const services = createPlanningCenterServices(
    "schedule-test-token",
    "America/Los_Angeles",
    unreachableHttpClient,
    createPlanningCenterReadCaches(null)
  );
  const getTeamPositions = vi
    .spyOn(services.catalog, "getServiceTypeTeamPositionsWithTeams")
    .mockReturnValue(Effect.succeed(teamPositions()));
  vi.spyOn(services.people, "getPersonTeamPositionAssignments").mockReturnValue(
    Effect.succeed({
      data: [
        {
          id: "assignment-1",
          type: "PersonTeamPositionAssignment",
          attributes: {},
          relationships: {
            team_position: {
              data: { id: "position-1", type: "TeamPosition" },
            },
          },
        },
      ],
      included: [],
    })
  );
  const create = vi.spyOn(services.people, "createPlanPerson").mockReturnValue(
    Effect.succeed({
      id: "plan-person-1",
      type: "PlanPerson",
      attributes: { team_position_name: "Band - Vocals" },
    })
  );
  const remove = vi
    .spyOn(services.people, "deletePlanPerson")
    .mockReturnValue(Effect.void);
  const update = vi
    .spyOn(services.people, "updatePlanPersonStatus")
    .mockReturnValue(
      Effect.succeed({
        id: "plan-person-1",
        type: "PlanPerson",
        attributes: { status: "C" },
      })
    );
  const invalidate = vi.spyOn(services.people, "invalidateScheduleReadCaches");
  const authorize = vi
    .fn<PlanningCenterAccessDependencies["authorize"]>()
    .mockResolvedValue({
      kind: "account",
      userId: "user-1",
      accessToken: "schedule-test-token",
      accountId: "account-1",
      account: { id: "account-1", accountId: "provider-account-1" },
      scopes: ["services"],
    });
  const recordActivity = vi
    .fn<(event: ActivityEventInput) => Promise<void>>()
    .mockResolvedValue();
  const dependencies = {
    access: {
      authorize,
      createServices: () => services,
      presentationMode: () => false,
      presentationSeed: "test-seed",
    },
    recordActivity,
  };
  const router = createScheduleRouter(dependencies);
  const context = {
    request: new Request("https://pcobooster.com/api/rpc/schedule/assign", {
      method: "POST",
      headers: { "x-forwarded-for": "192.0.2.5", "user-agent": "test-agent" },
    }),
    requestId: "request-1",
    resHeaders: new Headers(),
    runtime: testRuntime(),
    server: testServer(),
  };
  return {
    services,
    dependencies,
    router,
    context,
    recordActivity,
    create,
    remove,
    update,
    getTeamPositions,
    invalidate,
    authorize,
  };
};
