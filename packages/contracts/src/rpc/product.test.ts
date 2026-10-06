import { procedureKindOf } from "@pcobooster/contracts/rpc/procedure";
import { ProductRpc } from "@pcobooster/contracts/rpc/product";
import { describe, expect, it } from "vitest";

const procedures = [...ProductRpc.requests.values()];

describe(ProductRpc, () => {
  it("declares every procedure with read() or write()", () => {
    expect(
      procedures.filter((rpc) => procedureKindOf(rpc) === undefined)
    ).toStrictEqual([]);
  });

  it("wraps every procedure in ProcedureScope, outside its namespace middleware", () => {
    // RpcServer applies the last middleware outermost.
    const orders = new Set(
      procedures.map((rpc) =>
        [...rpc.middlewares].map((service) => service.key).join(" < ")
      )
    );

    expect([...orders].toSorted()).toStrictEqual([
      "@pcobooster/PlanningCenterSession < @pcobooster/ProcedureScope",
      "@pcobooster/ProcedureScope",
    ]);
  });
});
