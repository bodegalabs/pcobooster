import type { BoundaryLog } from "@pcobooster/api/logging";
import { PlanningCenterApiError } from "@pcobooster/api/planning-center/api-error";
import { testServer } from "@pcobooster/api/testing/server";
import {
  setupSyntheticSchedule,
  teamPositions,
} from "@pcobooster/api/transport/rpc/schedule.fixture";
import { createRpcClient } from "@pcobooster/client/rpc";
import type { scheduleAssignInputSchema } from "@pcobooster/contracts/schedule";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { createServerApp } from "./app";
import { serveForTest } from "./test-app";

const assignment: typeof scheduleAssignInputSchema.Type = {
  oneOff: false,
  serviceTypeId: "service-1",
  planId: "plan-1",
  personId: "person-1",
  teamId: "team-1",
  positionId: "position-1",
};
const assignmentRequest = (signal?: AbortSignal) =>
  new Request("http://localhost/api/rpc/", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-pcobooster-account": "account-1",
    },
    body: JSON.stringify([
      {
        _tag: "Request",
        id: "0",
        tag: "schedule.assign",
        payload: assignment,
        headers: [],
      },
    ]),
  });
const syntheticApp = (fixture: ReturnType<typeof setupSyntheticSchedule>) =>
  serveForTest(
    createServerApp({
      server: testServer(),
      scheduleDependencies: fixture.dependencies,
      log: { error: vi.fn<BoundaryLog["error"]>() },
    })
  );

describe("synthetic scheduling through native HTTP RPC", () => {
  it("executes scheduling and declared retry failures through the shared client", async () => {
    const fixture = setupSyntheticSchedule();
    const app = syntheticApp(fixture);
    const client = createRpcClient({
      url: () => "http://localhost/api/rpc",
      fetch: async (input, init) => await app.request(new Request(input, init)),
    });
    await expect(
      client.call("schedule.assign", assignment)
    ).resolves.toStrictEqual({ success: true, data: { id: "plan-person-1" } });
    fixture.create.mockReturnValueOnce(
      Effect.fail(
        new PlanningCenterApiError({
          status: 429,
          message: "Rate limited",
          retryAfterSeconds: 5,
        })
      )
    );
    await expect(
      client.call("schedule.assign", assignment)
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      retryAfterSeconds: 5,
      data: { retryAfterSeconds: 5 },
    });
  });

  it("carries shared-client cancellation into provider preflight without a write", async () => {
    const fixture = setupSyntheticSchedule();
    const app = syntheticApp(fixture);
    const controller = new AbortController();
    const preflight = Promise.withResolvers<ReturnType<typeof teamPositions>>();
    fixture.getTeamPositions.mockReturnValueOnce(
      Effect.promise(async () => await preflight.promise)
    );
    const client = createRpcClient({
      url: () => "http://localhost/api/rpc",
      fetch: async (input, init) => await app.request(new Request(input, init)),
    });
    const pending = client.call("schedule.assign", assignment, {
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(fixture.getTeamPositions).toHaveBeenCalledOnce();
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fixture.create).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(fixture.recordActivity).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          success: false,
          errorCode: "CLIENT_CLOSED_REQUEST",
        })
      );
    });
    preflight.resolve(teamPositions());
  });

  it("validates and executes provider writes with an isolated typed adapter", async () => {
    const fixture = setupSyntheticSchedule();
    const response = await syntheticApp(fixture).request(assignmentRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual([
      {
        _tag: "Exit",
        requestId: "0",
        exit: {
          _tag: "Success",
          value: { success: true, data: { id: "plan-person-1" } },
        },
      },
    ]);
    expect(fixture.create).toHaveBeenCalledExactlyOnceWith(
      "service-1",
      "person-1",
      "plan-1",
      "team-1",
      "Vocals"
    );
    expect(fixture.recordActivity).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ success: true, actorAccountId: "account-1" })
    );
  });

  it("preserves declared provider retry information", async () => {
    const fixture = setupSyntheticSchedule();
    fixture.create.mockReturnValueOnce(
      Effect.fail(
        new PlanningCenterApiError({
          status: 429,
          message: "Rate limited",
          retryAfterSeconds: 5,
        })
      )
    );
    const response = await syntheticApp(fixture).request(assignmentRequest());
    await expect(response.json()).resolves.toMatchObject([
      {
        exit: {
          _tag: "Failure",
          cause: [
            {
              _tag: "Fail",
              error: {
                code: "TOO_MANY_REQUESTS",
                status: 429,
                retryAfterSeconds: 5,
                data: { retryAfterSeconds: 5 },
              },
            },
          ],
        },
      },
    ]);
    expect(fixture.recordActivity).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        success: false,
        errorCode: "TOO_MANY_REQUESTS",
      })
    );
  });

  it("finishes a committed provider write and its audit when the HTTP caller disconnects", async () => {
    const fixture = setupSyntheticSchedule();
    const controller = new AbortController();
    const completion = Promise.withResolvers<null>();
    fixture.create.mockReturnValueOnce(
      Effect.promise(async () => {
        controller.abort();
        await completion.promise;
        return {
          id: "plan-person-1",
          type: "PlanPerson",
          attributes: { team_position_name: "Band - Vocals" },
        };
      })
    );
    const pending = syntheticApp(fixture).request(
      assignmentRequest(controller.signal)
    );
    const outcome = pending.catch(() => {});
    await vi.waitFor(() => {
      expect(fixture.create).toHaveBeenCalledOnce();
    });
    expect(fixture.recordActivity).not.toHaveBeenCalled();
    completion.resolve(null);
    await outcome;
    expect(fixture.recordActivity).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ success: true, errorCode: null })
    );
  });
});
