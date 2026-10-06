import { describe, expect, it } from "vitest";

import {
  rewriteCallSites,
  rewriteQuerySites,
  rewriteTransportMetadata,
} from "./httpapi-call-sites";

const rewrite = (source: string) => rewriteCallSites("site.ts", source);

describe(rewriteCallSites, () => {
  it.each([
    [
      "path params only",
      'await client.call("catalog.plan", { serviceTypeId, planId: "2" }, options);',
      'await client.run((api) => api.catalog.plan({ params: { serviceTypeId, planId: "2" } }), options);',
    ],
    [
      "path params and query",
      'client.call("catalog.adjacentPlans", { serviceTypeId, planId, direction: "next" })',
      'client.run((api) => api.catalog.adjacentPlans({ params: { serviceTypeId, planId }, query: { direction: "next" } }))',
    ],
    [
      "a body, with a spread that goes to every part",
      'productClient.call("schedule.updateStatus", { ...target, status: "C" })',
      'productClient.run((api) => api.schedule.updateStatus({ params: { ...target }, payload: { ...target, status: "C" } }))',
    ],
    [
      "an input that is not a literal, whole to every part",
      'app.client().call("planItems.create", input, { signal })',
      "app.client().run((api) => api.planItems.create({ params: input, payload: input }), { signal })",
    ],
    [
      "no input, under its renamed tag",
      'client.call("health", {}); client.call("people.dashboardRoster", undefined, { signal })',
      "client.run((api) => api.health.get()); client.run((api) => api.people.dashboardRoster(), { signal })",
    ],
    [
      "a query only, from a POST read's neighbour",
      'client.call("people.search", { query: q })',
      "client.run((api) => api.people.search({ query: { query: q } }))",
    ],
    [
      "a structured POST read",
      'client.call("people.candidateDetails", { planId, date, personIds })',
      "client.run((api) => api.people.candidateDetails({ params: { planId }, payload: { date, personIds } }))",
    ],
    [
      "DELETE context in the query",
      'client.call("schedule.remove", { planPersonId, serviceTypeId, planId })',
      "client.run((api) => api.schedule.remove({ params: { planPersonId }, query: { serviceTypeId, planId } }))",
    ],
  ])("places %s", (_case, source, expected) => {
    expect(rewrite(source)).toMatchObject({ source: expected, skipped: [] });
  });

  it("preserves spread precedence and avoids shadowing an input variable", () => {
    expect(
      rewrite(
        'client.call("schedule.updateStatus", { status: "C", ...target })'
      ).source
    ).toBe(
      'client.run((api) => api.schedule.updateStatus({ params: { ...target }, payload: { status: "C", ...target } }))'
    );
    expect(rewrite('client.call("people.search", api)').source).toBe(
      "client.run((api1) => api1.people.search({ query: api }))"
    );
  });

  it("leaves what it cannot place, and says why", () => {
    const source = [
      "client.call(tag, input);",
      'client.call("catalog.retired", {});',
      'client.call("catalog.plan", { [key]: "1" });',
      "fn.call(this, 1);",
    ].join("\n");

    expect(rewrite(source)).toStrictEqual({
      source,
      rewritten: 0,
      skipped: [
        { file: "site.ts", line: 1, reason: "the tag is not a string literal" },
        {
          file: "site.ts",
          line: 2,
          reason: "unknown procedure catalog.retired",
        },
        { file: "site.ts", line: 3, reason: "a computed key in the input" },
      ],
    });
  });
});

describe("restack updates", () => {
  it("uses an origin for client construction, the API prefix for raw requests, and the new header grammar", () => {
    const input =
      'import { RPC_PROTOCOL_VERSION } from "@pcobooster/contracts/rpc/client-version"; makeProductClient({ url: `ORIGIN/api/rpc` }); fetch(`ORIGIN/api/rpc`); const header = "expo;rpc=1";';
    expect(rewriteTransportMetadata("app.ts", input).source).toBe(
      'import { API_VERSION } from "@pcobooster/contracts/http/client-version"; makeProductClient({ url: `ORIGIN` }); fetch(`ORIGIN/api/v1`); const header = "expo;api=1";'
    );
  });

  it("passes the native read callback directly to the query helper", () => {
    expect(
      rewriteQuerySites(
        "read.ts",
        "callForQuery(context, async (options) => await client.run((api) => api.catalog.plans({ params }), options))"
      ).source
    ).toBe(
      "callForQuery(context, client, (api) => api.catalog.plans({ params }))"
    );
  });

  it("is idempotent after native conversion", () => {
    const native = rewrite(
      'client.call("people.candidateDetails", { planId, date, personIds })'
    ).source;
    expect(rewrite(native)).toStrictEqual({
      source: native,
      rewritten: 0,
      skipped: [],
    });
  });
});
