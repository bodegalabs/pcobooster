import { call } from "@orpc/server";
import { PlanningCenterRequestAccounting } from "@pcobooster/api/planning-center/request-accounting";
import { testServer } from "@pcobooster/api/testing/server";
import { rpc } from "@pcobooster/api/transport/orpc/implementation";
import { describe, expect, it } from "vitest";

const context = () => ({
  request: new Request("https://pcobooster.com/api/rpc/health"),
  requestId: "request-1",
  server: testServer(),
});

describe("oRPC procedure middleware", () => {
  it("gives every procedure its own Planning Center accounting", async () => {
    const seen: PlanningCenterRequestAccounting[] = [];
    const procedure = rpc.health.handler(({ context: procedureContext }) => {
      seen.push(procedureContext.planningCenterAccounting);
      return { status: "ok" as const, version: "test" };
    });

    await call(procedure, {}, { context: context() });
    await call(procedure, {}, { context: context() });

    expect(seen).toHaveLength(2);
    expect(seen[0]).toBeInstanceOf(PlanningCenterRequestAccounting);
    expect(seen[0]).not.toBe(seen[1]);
  });
});
