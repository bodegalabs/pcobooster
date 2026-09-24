import { call } from "@orpc/server";
import {
  createRequestContext,
  RequestContext,
} from "@pcobooster/api/application/context";
import type { PlanningCenterAccessDependencies } from "@pcobooster/api/application/planning-center-access";
import { PlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import {
  commitScheduledPerson,
  prepareScheduledPerson,
  removeScheduledPerson,
  updateScheduledPersonStatus,
} from "@pcobooster/api/application/schedule";
import type { ScheduleApplicationDependencies } from "@pcobooster/api/application/schedule";
import type { ActivityEventInput } from "@pcobooster/api/db/activity-events";
import { PlanningCenterApiError } from "@pcobooster/api/planning-center/api-error";
import { createPlanningCenterServices } from "@pcobooster/api/planning-center/services/factory";
import { testServer } from "@pcobooster/api/testing/server";
import { createScheduleRouter } from "@pcobooster/api/transport/orpc/schedule";
import type { ScheduleAssignInput } from "@pcobooster/contracts/schedule";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const input: ScheduleAssignInput = {
  serviceTypeId: "service-1",
  planId: "plan-1",
  personId: "person-1",
  teamId: "team-1",
  positionId: "position-1",
};

const setup = () => {
  const services = createPlanningCenterServices(
    "schedule-test-token",
    "America/Los_Angeles"
  );
  const getTeamPositions = vi
    .spyOn(services.catalog, "getServiceTypeTeamPositionsWithTeams")
    .mockResolvedValue({
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
  vi.spyOn(
    services.people,
    "getPersonTeamPositionAssignments"
  ).mockResolvedValue({
    data: [
      {
        id: "assignment-1",
        type: "PersonTeamPositionAssignment",
        attributes: {},
        relationships: {
          team_position: { data: { id: "position-1", type: "TeamPosition" } },
        },
      },
    ],
    included: [],
  });
  const create = vi
    .spyOn(services.people, "createPlanPerson")
    .mockResolvedValue({
      id: "plan-person-1",
      type: "PlanPerson",
      attributes: { team_position_name: "Band - Vocals" },
    });
  const remove = vi
    .spyOn(services.people, "deletePlanPerson")
    .mockResolvedValue();
  const update = vi
    .spyOn(services.people, "updatePlanPersonStatus")
    .mockResolvedValue({
      id: "plan-person-1",
      type: "PlanPerson",
      attributes: { status: "C" },
    });
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
  const router = createScheduleRouter({
    access: {
      authorize,
      createServices: () => services,
      presentationMode: () => false,
      presentationSeed: "test-seed",
      fallbackTimeZone: "America/Los_Angeles",
    },
    recordActivity,
  });
  const context = {
    request: new Request("https://pcobooster.com/api/rpc/schedule/assign", {
      method: "POST",
      headers: { "x-forwarded-for": "192.0.2.5", "user-agent": "test-agent" },
    }),
    requestId: "request-1",
    resHeaders: new Headers(),
    server: testServer(),
  };
  return {
    services,
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

describe("scheduling oRPC transport", () => {
  it("uses the request cache scope for each mutation and hides duplicate details in presentation mode", async () => {
    const { services, authorize, context, create } = setup();
    const authentication = await authorize(context.request);
    const access = {
      authentication,
      services,
      cacheScope: services.core.getCacheScope(),
      presentation: true,
      presentationSeed: "test-seed",
      fallbackTimeZone: "America/Los_Angeles",
    };
    const dependencies: ScheduleApplicationDependencies = {
      invalidateHistory:
        vi.fn<ScheduleApplicationDependencies["invalidateHistory"]>(),
    };
    const withRequestContext = <Value, Failure>(
      program: Effect.Effect<Value, Failure, RequestContext>
    ) =>
      Effect.provideService(
        program,
        RequestContext,
        createRequestContext(context.request)
      );
    const prepareAssignment = async () =>
      await Effect.runPromise(
        withRequestContext(
          Effect.provideService(
            prepareScheduledPerson(input, dependencies),
            PlanningCenterAccess,
            access
          )
        )
      );
    const commitAssignment = async (
      preparation: Awaited<ReturnType<typeof prepareAssignment>>
    ) =>
      await Effect.runPromise(
        withRequestContext(
          Effect.provideService(
            commitScheduledPerson(input, preparation, dependencies),
            PlanningCenterAccess,
            access
          )
        )
      );
    const assign = async () =>
      await commitAssignment(await prepareAssignment());
    await assign();
    const existingInput = {
      planPersonId: "plan-person-1",
      personId: "person-1",
      serviceTypeId: "service-1",
      planId: "plan-1",
    };
    await Effect.runPromise(
      withRequestContext(
        Effect.provideService(
          removeScheduledPerson(existingInput, dependencies),
          PlanningCenterAccess,
          access
        )
      )
    );
    await Effect.runPromise(
      withRequestContext(
        Effect.provideService(
          updateScheduledPersonStatus(
            { ...existingInput, status: "C" },
            dependencies
          ),
          PlanningCenterAccess,
          access
        )
      )
    );
    create.mockRejectedValueOnce(
      new Error("Person has already been scheduled for this position")
    );
    const duplicatePreparation = await prepareAssignment();
    const duplicate = await Effect.runPromise(
      Effect.result(
        withRequestContext(
          Effect.provideService(
            commitScheduledPerson(input, duplicatePreparation, dependencies),
            PlanningCenterAccess,
            access
          )
        )
      )
    );
    expect(duplicate).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "AlreadyScheduled", details: undefined },
    });
    expect(dependencies.invalidateHistory).toHaveBeenCalledTimes(4);
    expect(dependencies.invalidateHistory).toHaveBeenNthCalledWith(
      1,
      "person-1",
      access.cacheScope
    );
    expect(dependencies.invalidateHistory).toHaveBeenNthCalledWith(
      3,
      "person-1",
      access.cacheScope
    );
    expect(dependencies.invalidateHistory).toHaveBeenNthCalledWith(
      4,
      "person-1",
      access.cacheScope
    );
  });

  it("assigns with the authorized services and records complete activity context", async () => {
    const { router, context, recordActivity, create, authorize } = setup();
    await expect(
      call(router.assign, input, { context })
    ).resolves.toStrictEqual({ success: true, data: { id: "plan-person-1" } });
    expect({
      authorizations: authorize.mock.calls.length,
      cacheControl: context.resHeaders.get("cache-control"),
    }).toStrictEqual({ authorizations: 1, cacheControl: "private, no-store" });
    expect(create).toHaveBeenCalledWith(
      "service-1",
      "person-1",
      "plan-1",
      "team-1",
      "Vocals"
    );
    expect(recordActivity).toHaveBeenCalledExactlyOnceWith({
      requestId: "request-1",
      path: "/api/rpc/schedule/assign",
      method: "POST",
      ipAddress: "192.0.2.5",
      userAgent: "test-agent",
      eventType: "schedule_attempt",
      actorUserId: "user-1",
      actorAccountId: "account-1",
      success: true,
      statusCode: 200,
      errorCode: null,
      serviceTypeId: "service-1",
      personId: "person-1",
      planId: "plan-1",
      teamId: "team-1",
      positionId: "position-1",
      metadata: { planPersonId: "plan-person-1", oneOff: false },
    });
  });

  it("records invalid input without attempting a provider mutation", async () => {
    const { router, context, recordActivity, create } = setup();
    await expect(
      call(router.assign, { ...input, planId: "" }, { context })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", status: 400 });
    expect(create).not.toHaveBeenCalled();
    expect(recordActivity).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        actorUserId: "user-1",
        actorAccountId: "account-1",
        success: false,
        statusCode: 400,
        errorCode: "BAD_REQUEST",
      })
    );
  });

  it("preserves the already-scheduled conflict and refreshes scoped reads", async () => {
    const { router, context, recordActivity, create, invalidate } = setup();
    create.mockRejectedValue(
      new PlanningCenterApiError({
        status: 422,
        message: "Person has already been scheduled for this position",
      })
    );
    await expect(call(router.assign, input, { context })).rejects.toMatchObject(
      {
        code: "ALREADY_SCHEDULED",
        status: 409,
        data: {
          details: "Person has already been scheduled for this position",
        },
      }
    );
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({
      ...input,
      oneOff: false,
    });
    expect(recordActivity).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        success: false,
        statusCode: 409,
        errorCode: "ALREADY_SCHEDULED",
      })
    );
  });

  it("returns the created assignment and selected position on a partial-success mismatch", async () => {
    const { router, context, recordActivity, create } = setup();
    create.mockResolvedValue({
      id: "created-mismatch",
      type: "PlanPerson",
      attributes: { team_position_name: "Band - Drums" },
    });
    await expect(call(router.assign, input, { context })).rejects.toMatchObject(
      {
        code: "POSITION_MISMATCH",
        status: 409,
        data: {
          details: {
            selected: {
              teamId: "team-1",
              teamName: "Band",
              positionId: "position-1",
              positionName: "Vocals",
            },
            created: {
              planPersonId: "created-mismatch",
              teamPositionName: "Band - Drums",
            },
          },
        },
      }
    );
    expect(recordActivity).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        success: false,
        statusCode: 409,
        errorCode: "POSITION_MISMATCH",
        metadata: {
          selectedTeamName: "Band",
          selectedPositionName: "Vocals",
          createdTeamPositionName: "Band - Drums",
          planPersonId: "created-mismatch",
        },
      })
    );
  });

  it("removes and changes status with request-owned services and audit metadata", async () => {
    const { router, context, recordActivity, remove, update } = setup();
    const removalInput = {
      planPersonId: "plan-person-1",
      personId: "person-1",
      serviceTypeId: "service-1",
      planId: "plan-1",
    };
    const removed = await call(router.remove, removalInput, { context });
    const updated = await call(
      router.updateStatus,
      { ...removalInput, status: "D" },
      { context }
    );
    expect({ removed, updated }).toStrictEqual({
      removed: { success: true },
      updated: { success: true },
    });
    expect(remove).toHaveBeenCalledExactlyOnceWith(
      "plan-person-1",
      removalInput
    );
    expect(update).toHaveBeenCalledExactlyOnceWith("plan-person-1", "D", {
      ...removalInput,
      status: "D",
    });
    expect(recordActivity).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        eventType: "schedule_remove",
        success: true,
        metadata: removalInput,
      })
    );
    expect(recordActivity).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        eventType: "schedule_status_change",
        success: true,
        metadata: { ...removalInput, status: "D" },
      })
    );
  });

  it("maps provider failure and keeps audit persistence failure from changing a successful mutation", async () => {
    const { router, context, recordActivity, create } = setup();
    create.mockRejectedValueOnce(
      new PlanningCenterApiError({
        status: 429,
        message: "Rate limited",
        retryAfterSeconds: 5,
      })
    );
    await expect(call(router.assign, input, { context })).rejects.toMatchObject(
      { code: "TOO_MANY_REQUESTS", data: { retryAfterSeconds: 5 } }
    );
    expect(recordActivity).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        success: false,
        statusCode: 429,
        errorCode: "TOO_MANY_REQUESTS",
      })
    );
    recordActivity.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(
      call(router.assign, input, { context })
    ).resolves.toMatchObject({ success: true });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("cancels interruptible assignment preflight without starting a provider write", async () => {
    const { router, context, recordActivity, create, getTeamPositions } =
      setup();
    const controller = new AbortController();
    const preflight =
      Promise.withResolvers<Awaited<ReturnType<typeof getTeamPositions>>>();
    getTeamPositions.mockReturnValueOnce(preflight.promise);

    const pending = call(router.assign, input, {
      context,
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(getTeamPositions).toHaveBeenCalledOnce();
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      code: "CLIENT_CLOSED_REQUEST",
    });
    expect(create).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(recordActivity).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          success: false,
          errorCode: "CLIENT_CLOSED_REQUEST",
        })
      );
    });
    preflight.resolve({
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
    await Promise.resolve();
    expect(create).not.toHaveBeenCalled();
  });

  it("waits for an in-flight assignment write before recording success after disconnect", async () => {
    const { router, context, recordActivity, create } = setup();
    const controller = new AbortController();
    const completion =
      Promise.withResolvers<Awaited<ReturnType<typeof create>>>();
    create.mockImplementationOnce(async () => {
      controller.abort();
      return await completion.promise;
    });

    const pending = call(router.assign, input, {
      context,
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(create).toHaveBeenCalledOnce();
    });
    expect(recordActivity).not.toHaveBeenCalled();
    completion.resolve({
      id: "plan-person-1",
      type: "PlanPerson",
      attributes: { team_position_name: "Band - Vocals" },
    });

    await expect(pending).resolves.toStrictEqual({
      success: true,
      data: { id: "plan-person-1" },
    });
    expect(recordActivity).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ success: true, errorCode: null })
    );
  });

  it("waits for an in-flight removal before recording success after disconnect", async () => {
    const { router, context, recordActivity, remove } = setup();
    const controller = new AbortController();
    const completion = Promise.withResolvers<null>();
    remove.mockImplementationOnce(async () => {
      controller.abort();
      await completion.promise;
    });
    const removalInput = {
      planPersonId: "plan-person-1",
      personId: "person-1",
      serviceTypeId: "service-1",
      planId: "plan-1",
    };

    const pending = call(router.remove, removalInput, {
      context,
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(remove).toHaveBeenCalledOnce();
    });
    expect(recordActivity).not.toHaveBeenCalled();
    completion.resolve(null);

    await expect(pending).resolves.toStrictEqual({ success: true });
    expect(recordActivity).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ success: true, errorCode: null })
    );
  });

  it("waits for an in-flight status update before recording success after disconnect", async () => {
    const { router, context, recordActivity, update } = setup();
    const controller = new AbortController();
    const completion =
      Promise.withResolvers<Awaited<ReturnType<typeof update>>>();
    update.mockImplementationOnce(async () => {
      controller.abort();
      return await completion.promise;
    });
    const updateInput = {
      planPersonId: "plan-person-1",
      personId: "person-1",
      serviceTypeId: "service-1",
      planId: "plan-1",
      status: "C" as const,
    };

    const pending = call(router.updateStatus, updateInput, {
      context,
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(update).toHaveBeenCalledOnce();
    });
    expect(recordActivity).not.toHaveBeenCalled();
    completion.resolve({
      id: "plan-person-1",
      type: "PlanPerson",
      attributes: { status: "C" },
    });

    await expect(pending).resolves.toStrictEqual({ success: true });
    expect(recordActivity).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ success: true, errorCode: null })
    );
  });
});
