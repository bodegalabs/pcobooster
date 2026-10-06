import {
  createRequestContext,
  RequestContext,
} from "@pcobooster/api/application/context";
import { provideAccess } from "@pcobooster/api/application/planning-center-access";
import {
  commitRunSheetItemCreate,
  prepareRunSheetItemCreate,
  updateRunSheetTime,
} from "@pcobooster/api/application/run-sheet";
import {
  createPlanningCenterServices,
  createPlanningCenterReadCaches,
} from "@pcobooster/api/planning-center/services/factory";
import { Server } from "@pcobooster/api/server";
import type { SuccessOf } from "@pcobooster/api/testing/effect";
import { unreachableHttpClient } from "@pcobooster/api/testing/http-client";
import { testServer } from "@pcobooster/api/testing/server";
import { Cause, Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";

/**
 * Runs a program as a `write` procedure's parts run over RPC: a prepare step stops when the
 * caller leaves; a commit finishes uninterruptibly, and its real result is what the route
 * records, even though the caller has gone.
 */
const run = async <Value, Failure>(
  program: Effect.Effect<Value, Failure, RequestContext | Server>,
  signal: AbortSignal,
  step: "prepare" | "commit"
): Promise<Exit.Exit<Value, Failure>> => {
  let settled: Exit.Exit<Value, Failure> | undefined;
  const recorded = program.pipe(
    Effect.onExit((exit) =>
      Effect.sync(() => {
        settled = exit;
      })
    ),
    Effect.provideService(
      RequestContext,
      createRequestContext(
        new Request(
          "https://pcobooster.com/api/v1/service-types/st-1/plans/plan-1/items",
          {
            method: "POST",
          }
        )
      )
    ),
    Effect.provideService(Server, testServer())
  );
  const exit = await Effect.runPromiseExit(
    step === "commit" ? Effect.uninterruptible(recorded) : recorded,
    { signal }
  );
  return settled ?? exit;
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
  };
  return { access, services };
};

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

    const pending = run(
      provideAccess(
        prepareRunSheetItemCreate({
          serviceTypeId: "service-1",
          planId: "plan-1",
          songId: "song-1",
        }),
        access
      ),
      controller.signal,
      "prepare"
    );
    await vi.waitFor(() => {
      expect(getSong).toHaveBeenCalledOnce();
    });
    controller.abort();
    const exit = await pending;
    expect(
      Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)
    ).toBeTruthy();

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

    const pending = run(
      provideAccess(
        commitRunSheetItemCreate({
          serviceTypeId: "service-1",
          planId: "plan-1",
          attributes: { title: "Song title" },
        }),
        access
      ),
      controller.signal,
      "commit"
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
      _tag: "Success",
      value: { id: "item-1", title: "Song title" },
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

    const pending = run(
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
      controller.signal,
      "commit"
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
      _tag: "Success",
      value: { id: "time-1", name: "Service" },
    });
    expect(updateNeededPosition).toHaveBeenCalledExactlyOnceWith(
      "service-1",
      "plan-1",
      "needed-position-1",
      "time-1"
    );
  });
});
