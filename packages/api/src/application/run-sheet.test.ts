import { PlanningCenterAccess } from "@worship-admin/api/application/planning-center-access";
import {
  commitRunSheetItemCreate,
  prepareRunSheetItemCreate,
  updateRunSheetTime,
} from "@worship-admin/api/application/run-sheet";
import { createPlanningCenterServices } from "@worship-admin/api/planning-center/services/factory";
import { executeApplicationEffect } from "@worship-admin/api/transport/orpc/execute";
import { applicationRuntime } from "@worship-admin/api/transport/orpc/implementation";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const context = {
  request: new Request("https://worshipadmin.com/api/rpc/planItems/create", {
    method: "POST",
  }),
  requestId: "run-sheet-request",
  resHeaders: new Headers(),
};

const setup = () => {
  const services = createPlanningCenterServices("run-sheet-test-token");
  const access = {
    authentication: {
      userId: "user-1",
      accessToken: "run-sheet-test-token",
      scopes: ["services"],
      accountId: "account-1",
      account: { id: "account-1", accountId: "provider-account-1" },
    },
    cacheScope: services.core.getCacheScope(),
    services,
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
      Promise.withResolvers<
        Awaited<ReturnType<typeof services.songs.getSong>>
      >();
    const getSong = vi
      .spyOn(services.songs, "getSong")
      .mockReturnValueOnce(song.promise);
    vi.spyOn(services.songs, "getSongArrangementsWithKeys").mockResolvedValue({
      data: [],
      included: [],
    });
    vi.spyOn(services.songs, "getSongLastScheduledItem").mockResolvedValue({
      data: null,
      included: [],
    });
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
        Awaited<ReturnType<typeof services.planItems.createPlanItem>>
      >();
    const create = vi
      .spyOn(services.planItems, "createPlanItem")
      .mockImplementationOnce(async () => {
        controller.abort();
        return await completion.promise;
      });

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
      Promise.withResolvers<
        Awaited<ReturnType<typeof services.plans.updatePlanTime>>
      >();
    const updateTime = vi
      .spyOn(services.plans, "updatePlanTime")
      .mockImplementationOnce(async () => {
        controller.abort();
        return await completion.promise;
      });
    const updateNeededPosition = vi
      .spyOn(services.catalog, "updateServiceTypePlanNeededPositionTime")
      .mockResolvedValue({
        id: "needed-position-1",
        type: "ServiceTypePlanNeededPosition",
        attributes: {},
      });

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
