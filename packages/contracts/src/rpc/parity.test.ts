/**
 * The Effect RPC contract against main's oRPC router. `main-procedures.fixture.json` was
 * extracted once from main (its `source` says which commit and files): each procedure's name,
 * how main's transport ran it (`wrapper`), whether it is a read or a write, and its feature flag.
 */
import { isContractProcedure } from "@orpc/contract";
import type { AnyContractRouter } from "@orpc/contract";
import { appContract } from "@pcobooster/contracts";
import { procedureKindOf } from "@pcobooster/contracts/rpc/procedure";
import { ProductRpc } from "@pcobooster/contracts/rpc/product";
import { requiredFeatureOf } from "@pcobooster/contracts/rpc/required-feature";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import mainProcedures from "./main-procedures.fixture.json" with { type: "json" };

const fixtureSchema = Schema.Struct({
  source: Schema.String,
  procedures: Schema.Array(
    Schema.Struct({
      tag: Schema.String,
      wrapper: Schema.Literals([
        "read",
        "prepared-write",
        "committed-write",
        "audited-schedule-write",
        "plain",
      ]),
      kind: Schema.Literals(["read", "write"]),
      feature: Schema.NullOr(Schema.Literals(["people", "chordCharts"])),
    })
  ),
});
const main = Schema.decodeUnknownSync(fixtureSchema)(mainProcedures);

const PLANNING_CENTER_SESSION = "@pcobooster/PlanningCenterSession";

const declared = [...ProductRpc.requests.values()]
  .map((rpc) => ({
    tag: rpc._tag,
    kind: procedureKindOf(rpc) ?? null,
    feature: requiredFeatureOf(rpc) ?? null,
    planningCenterSession: [...rpc.middlewares].some(
      (service) => service.key === PLANNING_CENTER_SESSION
    ),
  }))
  .toSorted((a, b) => a.tag.localeCompare(b.tag));

/** Every procedure path in an oRPC contract router, dotted. */
const contractPaths = (
  router: AnyContractRouter,
  prefix: readonly string[]
): string[] =>
  isContractProcedure(router)
    ? [prefix.join(".")]
    : Object.entries(router).flatMap(([key, child]) =>
        contractPaths(child, [...prefix, key])
      );

describe("parity with main's oRPC procedures", () => {
  it("lists the procedures main's router serves today", () => {
    expect(contractPaths(appContract, []).toSorted()).toStrictEqual(
      main.procedures.map(({ tag }) => tag)
    );
  });

  it("declares the same 49 procedures, each a read or a write as main ran it, with main's flags", () => {
    expect(main.procedures).toHaveLength(49);
    expect(
      declared.map(({ tag, kind, feature }) => ({ tag, kind, feature }))
    ).toStrictEqual(
      main.procedures.map(({ tag, kind, feature }) => ({ tag, kind, feature }))
    );
  });

  it("resolves Planning Center access for exactly the procedures main did", () => {
    expect(
      declared
        .filter(({ planningCenterSession }) => !planningCenterSession)
        .map(({ tag }) => tag)
    ).toStrictEqual(
      main.procedures
        .filter(({ wrapper }) => wrapper === "plain")
        .map(({ tag }) => tag)
    );
  });
});
