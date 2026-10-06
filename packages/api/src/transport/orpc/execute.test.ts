import { RequestContext } from "@pcobooster/api/application/context";
import { moduleLog } from "@pcobooster/api/logging";
import { currentPlanningCenterRequestCount } from "@pcobooster/api/planning-center/accounting";
import { PlanningCenterRequestAccounting } from "@pcobooster/api/planning-center/request-accounting";
import { recordLogs } from "@pcobooster/api/testing/logs";
import { testRuntime } from "@pcobooster/api/testing/runtime";
import { testServer } from "@pcobooster/api/testing/server";
import { executeApplicationEffect } from "@pcobooster/api/transport/orpc/execute";
import { Forbidden } from "@pcobooster/contracts/faults/forbidden";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

const createRpcContext = () => ({
  request: new Request("https://pcobooster.com/api/rpc/health"),
  requestId: "request-1",
  runtime: testRuntime(),
  server: testServer(),
});

describe(executeApplicationEffect, () => {
  it("provides request context to an Effect program", async () => {
    await expect(
      executeApplicationEffect(
        Effect.gen(function* readRequestId() {
          const { requestId } = yield* RequestContext;
          return requestId;
        }),
        createRpcContext()
      )
    ).resolves.toBe("request-1");
  });

  it("runs each procedure in a span named after it", async () => {
    const span = await executeApplicationEffect(
      Effect.map(Effect.orDie(Effect.currentSpan), ({ name, attributes }) => ({
        name,
        procedure: attributes.get("rpc.procedure"),
        requestId: attributes.get("request.id"),
      })),
      { ...createRpcContext(), procedure: "people.planWindowHistory" }
    );

    expect(span).toStrictEqual({
      name: "people.planWindowHistory",
      procedure: "people.planWindowHistory",
      requestId: "request-1",
    });
  });

  it("annotates a program's log lines with its procedure and request", async () => {
    const { lines, capture } = recordLogs();

    await executeApplicationEffect(
      capture(moduleLog("test").info("Roster read", { rosterCount: 3 })),
      { ...createRpcContext(), procedure: "people.dashboard" }
    );

    expect(lines).toStrictEqual([
      {
        level: "info",
        message: "Roster read",
        fields: {
          procedure: "people.dashboard",
          requestId: "request-1",
          rosterCount: 3,
        },
      },
    ]);
  });

  it("shares the procedure's Planning Center accounting with the program", async () => {
    const accounting = new PlanningCenterRequestAccounting();
    accounting.recordRequest();

    await expect(
      executeApplicationEffect(currentPlanningCenterRequestCount, {
        ...createRpcContext(),
        planningCenterAccounting: accounting,
      })
    ).resolves.toBe(1);
    await expect(
      executeApplicationEffect(
        currentPlanningCenterRequestCount,
        createRpcContext()
      )
    ).resolves.toBeUndefined();
  });

  it("maps typed application faults to oRPC errors", async () => {
    const result = executeApplicationEffect(
      Effect.fail(new Forbidden({ message: "Admin access required" })),
      createRpcContext()
    );
    await expect(result).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Admin access required",
      data: { message: "Admin access required" },
      status: 403,
    });
  });

  it("keeps defects opaque", async () => {
    const defect = new Error("Database credentials leaked here");

    const result = executeApplicationEffect(
      Effect.die(defect),
      createRpcContext()
    );
    await expect(result).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal Server Error",
    });
  });
});
