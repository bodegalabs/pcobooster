import { PlanningCenterRequestAccounting } from "@pcobooster/api/planning-center/request-accounting";
import { testRuntime } from "@pcobooster/api/testing/runtime";
import { testServer } from "@pcobooster/api/testing/server";
import {
  defineHandler,
  RpcRequest,
} from "@pcobooster/api/transport/rpc/implementation";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

const context = () => ({
  request: new Request("https://pcobooster.com/api/rpc"),
  requestId: "request-1",
  runtime: testRuntime(),
  server: testServer(),
});

describe("Effect RPC procedure boundary", () => {
  it("gives every procedure its own Planning Center accounting", async () => {
    const seen: (PlanningCenterRequestAccounting | undefined)[] = [];
    const procedure = defineHandler(
      "demo.exit",
      ({ context: procedureContext }) => {
        seen.push(procedureContext.planningCenterAccounting);
        return { demo: false };
      }
    );
    await Effect.runPromise(
      Effect.provideService(procedure({}), RpcRequest, context())
    );
    await Effect.runPromise(
      Effect.provideService(procedure({}), RpcRequest, context())
    );
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBeInstanceOf(PlanningCenterRequestAccounting);
    expect(seen[0]).not.toBe(seen[1]);
  });
});
