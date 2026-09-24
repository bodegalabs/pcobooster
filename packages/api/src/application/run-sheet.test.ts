import { PlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import {
  commitRunSheetItemCreate,
  prepareRunSheetItemCreate,
  updateRunSheetTime,
} from "@pcobooster/api/application/run-sheet";
import {
  createPlanningCenterServices,
  createPlanningCenterReadCaches,
} from "@pcobooster/api/planning-center/services/factory";
import type { SuccessOf } from "@pcobooster/api/testing/effect";
import { unreachableHttpClient } from "@pcobooster/api/testing/http-client";
import { testServer } from "@pcobooster/api/testing/server";
import { executeApplicationEffect } from "@pcobooster/api/transport/orpc/execute";
import { applicationRuntime } from "@pcobooster/api/transport/orpc/implementation";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const context = {
  request: new Request("https://pcobooster.com/api/rpc/planItems/create", {
    method: "POST",
  }),
  requestId: "run-sheet-request",
  resHeaders: new Headers(),
  server: testServer(),
};

const setup = () => {
  const services = createPlanningCenterServices(
    "run-sheet-test-token",
    "America/Los_Angeles",
    unreachableHttpClient,
    createPlanningCenterReadCaches(null)
  );
  const access = {
    authentication: {
      kind: "account" as const,
      userId: "user-1",
      accessToken: "run-sheet-test-token",
      scopes: ["services"],
      accountId: "account-1",
      account: { id: "account-1", accountId: "provider-account-1" },
    },
    cacheScope: services.core.getCacheScope(),
    services,
    presentation: false,
    presentationSeed: "test-seed",
    fallbackTimeZone: "America/Los_Angeles",
  };
  return { access, services };
};

const provideAccess = <Value, Failure, Requirements>(
  program: Effect.Effect<Value, Failure, Requirements>,
  access: ReturnType<typeof setup>["access"]
) => Effect.provideService(program, PlanningCenterAccess, access);

describe("run-sheet mutation cancellation", () => {
  it("does not start a create after an aborted song-default preflight", async () => {
    const { access, services } = setup();
    const controller = new AbortController();
    const song =
      Promise.withResolvers<SuccessOf<typeof services.songs.getSong>>();
    const getSong = vi
      .spyOn(services.songs, "getSong")
      .mockReturnValueOnce(Effect.promise(async () => await song.promise));
    vi.spyOn(services.songs, "getSongArrangementsWithKeys").mockReturnValue(
      Effect.succeed({ data: [], included: [] })
    );
    vi.spyOn(services.songs, "getSongLastScheduledItem").mockReturnValue(
      Effect.succeed({ data: null, included: [] })
    );
    const create = vi.spyOn(services.planItems, "createPlanItem");

    const pending = executeApplicationEffect(
      applicationRuntime,
      provideAccess(
        prepareRunSheetItemCreate({
          serviceTypeId: "service-1",
          planId: "plan-1",
          songId: "song-1",
        }),
        access
      ),
      context,
      controller.signal
    );
    await vi.waitFor(() => {
      expect(getSong).toHaveBeenCalledOnce();
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      code: "CLIENT_CLOSED_REQUEST",
    });

    song.resolve({
      id: "song-1",
      type: "Song",
      attributes: {
        title: "Song title",
        author: "",
        themes: "",
        hidden: false,
      },
    });
    await Promise.resolve();
    expect(create).not.toHaveBeenCalled();
  });

  it("waits for a started create and returns its actual result after disconnect", async () => {
    const { access, services } = setup();
    const controller = new AbortController();
    const completion =
      Promise.withResolvers<
        SuccessOf<typeof services.planItems.createPlanItem>
      >();
    const create = vi
      .spyOn(services.planItems, "createPlanItem")
      .mockReturnValueOnce(
        Effect.promise(async () => {
          controller.abort();
          return await completion.promise;
        })
      );

    const pending = executeApplicationEffect(
      applicationRuntime,
      provideAccess(
        commitRunSheetItemCreate({
          serviceTypeId: "service-1",
          planId: "plan-1",
          attributes: { title: "Song title" },
        }),
        access
      ),
      context,
      controller.signal,
      { interruptOnAbort: false }
    );
    await vi.waitFor(() => {
      expect(create).toHaveBeenCalledOnce();
    });

    completion.resolve({
      data: {
        id: "item-1",
        type: "Item",
        attributes: {
          title: "Song title",
          item_type: "song",
          sequence: 1,
          service_position: "during",
        },
      },
      included: [],
    });

    await expect(pending).resolves.toMatchObject({
      id: "item-1",
      title: "Song title",
    });
  });

  it("finishes follow-up plan-time writes after the first write starts", async () => {
    const { access, services } = setup();
    const controller = new AbortController();
    const completion =
      Promise.withResolvers<SuccessOf<typeof services.plans.updatePlanTime>>();
    const updateTime = vi
      .spyOn(services.plans, "updatePlanTime")
      .mockReturnValueOnce(
        Effect.promise(async () => {
          controller.abort();
          return await completion.promise;
        })
      );
    const updateNeededPosition = vi
      .spyOn(services.catalog, "updateServiceTypePlanNeededPositionTime")
      .mockReturnValue(
        Effect.succeed({
          id: "needed-position-1",
          type: "ServiceTypePlanNeededPosition",
          attributes: {},
        })
      );

    const pending = executeApplicationEffect(
      applicationRuntime,
      provideAccess(
        updateRunSheetTime({
          serviceTypeId: "service-1",
          planId: "plan-1",
          planTimeId: "time-1",
          name: "Service",
          assignedNeededPositionIds: ["needed-position-1"],
        }),
        access
      ),
      context,
      controller.signal,
      { interruptOnAbort: false }
    );
    await vi.waitFor(() => {
      expect(updateTime).toHaveBeenCalledOnce();
    });
    expect(updateNeededPosition).not.toHaveBeenCalled();

    completion.resolve({
      id: "time-1",
      type: "PlanTime",
      attributes: {
        name: "Service",
        starts_at: "2026-09-20T17:00:00.000Z",
        time_type: "service",
      },
    });

    await expect(pending).resolves.toMatchObject({
      id: "time-1",
      name: "Service",
    });
    expect(updateNeededPosition).toHaveBeenCalledExactlyOnceWith(
      "service-1",
      "plan-1",
      "needed-position-1",
      "time-1"
    );
  });
});
