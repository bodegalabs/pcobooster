import { procedureKindOf } from "@pcobooster/contracts/rpc/procedure";
import { ProductRpc } from "@pcobooster/contracts/rpc/product";
import { describe, expect, it } from "vitest";

describe(ProductRpc, () => {
  it("declares every procedure with read() or write()", () => {
    const kinds = Object.fromEntries(
      [...ProductRpc.requests.values()].map((rpc) => [
        rpc._tag,
        procedureKindOf(rpc),
      ])
    );

    expect(kinds).toStrictEqual({
      health: "read",
      "catalog.plan": "read",
      "schedule.assign": "write",
    });
  });

  it("wraps every procedure in ProcedureScope, outside its namespace middleware", () => {
    const middleware = Object.fromEntries(
      [...ProductRpc.requests.values()].map((rpc) => [
        rpc._tag,
        [...rpc.middlewares].map((service) => service.key),
      ])
    );

    // RpcServer applies the last middleware outermost.
    expect(middleware).toStrictEqual({
      health: ["@pcobooster/ProcedureScope"],
      "catalog.plan": [
        "@pcobooster/PlanningCenterSession",
        "@pcobooster/ProcedureScope",
      ],
      "schedule.assign": [
        "@pcobooster/PlanningCenterSession",
        "@pcobooster/ProcedureScope",
      ],
    });
  });
});
