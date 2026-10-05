import {
  createRequestContext,
  RequestContext,
} from "@pcobooster/api/application/context";
import { provideAccess } from "@pcobooster/api/application/planning-center-access";
import {
  commitScheduledPerson,
  prepareScheduledPerson,
  removeScheduledPerson,
  updateScheduledPersonStatus,
} from "@pcobooster/api/application/schedule";
import { PlanningCenterApiError } from "@pcobooster/api/planning-center/api-error";
import type { SuccessOf } from "@pcobooster/api/testing/effect";
import type { RpcContext } from "@pcobooster/api/transport/rpc/context";
import { RpcRequest } from "@pcobooster/api/transport/rpc/implementation";
import {
  setupSyntheticSchedule,
  teamPositions,
} from "@pcobooster/api/transport/rpc/schedule.fixture";
import type { scheduleAssignInputSchema } from "@pcobooster/contracts/schedule";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const call = async <Input, Value, Failure>(
  handler: (input: Input) => Effect.Effect<Value, Failure, RpcRequest>,
  input: Input,
  { context, signal }: { context: RpcContext; signal?: AbortSignal }
) =>
  await Effect.runPromise(
    Effect.provideService(handler(input), RpcRequest, {
      ...context,
      request:
        signal === undefined
          ? context.request
          : new Request(context.request, { signal }),
    })
  );

const input: typeof scheduleAssignInputSchema.Type = {
  oneOff: false,
  serviceTypeId: "service-1",
  planId: "plan-1",
  personId: "person-1",
  teamId: "team-1",
  positionId: "position-1",
};

const missingPlanPerson = () =>
  Effect.fail(new PlanningCenterApiError({ status: 404, message: "" }));

describe("scheduling Effect RPC transport", () => {
  it("uses the request cache scope for each mutation and hides duplicate details in presentation mode", async () => {
    const { services, authorize, context, create } = setupSyntheticSchedule();
    const authentication = await authorize(context.request);
    const access = {
      authentication,
      services,
      cacheScope: services.core.getCacheScope(),
      presentation: true,
      presentationSeed: "test-seed",
    };
    const invalidateWindowRosters = vi.spyOn(
      services.people,
      "invalidatePlanWindowRosters"
    );
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
        withRequestContext(provideAccess(prepareScheduledPerson(input), access))
      );
    const commitAssignment = async (
      preparation: Awaited<ReturnType<typeof prepareAssignment>>
    ) =>
      await Effect.runPromise(
        withRequestContext(
          provideAccess(commitScheduledPerson(input, preparation), access)
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
        provideAccess(removeScheduledPerson(existingInput), access)
      )
    );
    await Effect.runPromise(
      withRequestContext(
        provideAccess(
          updateScheduledPersonStatus({ ...existingInput, status: "C" }),
          access
        )
      )
    );
    create.mockReturnValueOnce(
      Effect.fail(
        new PlanningCenterApiError({
          status: 422,
          message: "Person has already been scheduled for this position",
        })
      )
    );
    const duplicatePreparation = await prepareAssignment();
    const duplicate = await Effect.runPromise(
      Effect.result(
        withRequestContext(
          provideAccess(
            commitScheduledPerson(input, duplicatePreparation),
            access
          )
        )
      )
    );
    expect(duplicate).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "AlreadyScheduled", details: undefined },
    });
    expect(invalidateWindowRosters).toHaveBeenCalledTimes(4);
  });

  it("assigns with the authorized services and records complete activity context", async () => {
    const { router, context, recordActivity, create, authorize } =
      setupSyntheticSchedule();
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
    const { router, context, recordActivity, create } =
      setupSyntheticSchedule();
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
    const { router, context, recordActivity, create, invalidate } =
      setupSyntheticSchedule();
    create.mockReturnValue(
      Effect.fail(
        new PlanningCenterApiError({
          status: 422,
          message: "Person has already been scheduled for this position",
        })
      )
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
    const { router, context, recordActivity, create } =
      setupSyntheticSchedule();
    create.mockReturnValue(
      Effect.succeed({
        id: "created-mismatch",
        type: "PlanPerson",
        attributes: { team_position_name: "Band - Drums" },
      })
    );
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
    const { router, context, recordActivity, remove, update } =
      setupSyntheticSchedule();
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

  it("reports a plan person Planning Center no longer has as not found", async () => {
    const { router, context, recordActivity, remove, update } =
      setupSyntheticSchedule();
    remove.mockReturnValueOnce(missingPlanPerson());
    update.mockReturnValueOnce(missingPlanPerson());
    const target = { planPersonId: "plan-person-1", planId: "plan-1" };
    const notFound = {
      code: "NOT_FOUND",
      status: 404,
      data: { resource: "plan-person" },
    };

    await expect(
      call(router.remove, target, { context })
    ).rejects.toMatchObject(notFound);
    await expect(
      call(router.updateStatus, { ...target, status: "C" }, { context })
    ).rejects.toMatchObject(notFound);
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, errorCode: "NOT_FOUND" })
    );
  });

  it("maps provider failure and keeps audit persistence failure from changing a successful mutation", async () => {
    const { router, context, recordActivity, create } =
      setupSyntheticSchedule();
    create.mockReturnValueOnce(
      Effect.fail(
        new PlanningCenterApiError({
          status: 429,
          message: "Rate limited",
          retryAfterSeconds: 5,
        })
      )
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
      setupSyntheticSchedule();
    const controller = new AbortController();
    const preflight =
      Promise.withResolvers<SuccessOf<typeof getTeamPositions>>();
    getTeamPositions.mockReturnValueOnce(
      Effect.promise(async () => await preflight.promise)
    );

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
    preflight.resolve(teamPositions());
    await Promise.resolve();
    expect(create).not.toHaveBeenCalled();
  });

  it("waits for an in-flight assignment write before recording success after disconnect", async () => {
    const { router, context, recordActivity, create } =
      setupSyntheticSchedule();
    const controller = new AbortController();
    const completion = Promise.withResolvers<SuccessOf<typeof create>>();
    create.mockReturnValueOnce(
      Effect.promise(async () => {
        controller.abort();
        return await completion.promise;
      })
    );

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
    const { router, context, recordActivity, remove } =
      setupSyntheticSchedule();
    const controller = new AbortController();
    const completion = Promise.withResolvers<null>();
    remove.mockReturnValueOnce(
      Effect.promise(async () => {
        controller.abort();
        await completion.promise;
      })
    );
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
    const { router, context, recordActivity, update } =
      setupSyntheticSchedule();
    const controller = new AbortController();
    const completion = Promise.withResolvers<SuccessOf<typeof update>>();
    update.mockReturnValueOnce(
      Effect.promise(async () => {
        controller.abort();
        return await completion.promise;
      })
    );
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
