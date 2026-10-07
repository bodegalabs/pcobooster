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
      'await client.call("catalog.plan", { serviceTypeId: "1", planId: "2" }, options);',
      'await client.run((api) => api.catalog.plan({ params: { serviceTypeId: "1", planId: "2" } }), options);',
    ],
    [
      "path params and query",
      'client.call("catalog.adjacentPlans", { serviceTypeId: "1", planId: "2", direction: "next" })',
      'client.run((api) => api.catalog.adjacentPlans({ params: { serviceTypeId: "1", planId: "2" }, query: { direction: "next" } }))',
    ],
    [
      "a body with path params",
      'productClient.call("schedule.updateStatus", { planPersonId: "1", planId: "2", status: "C" })',
      'productClient.run((api) => api.schedule.updateStatus({ params: { planPersonId: "1" }, payload: { planId: "2", status: "C" } }))',
    ],
    [
      "no input, under its renamed tag",
      'client.call("health", {}); client.call("people.dashboardRoster", {}, { signal })',
      "client.run((api) => api.health.get()); client.run((api) => api.people.dashboardRoster(), { signal })",
    ],
    [
      "a query only, from a POST read's neighbour",
      'client.call("people.search", { query: "q" })',
      'client.run((api) => api.people.search({ query: { query: "q" } }))',
    ],
    [
      "a structured POST read",
      'client.call("people.candidateDetails", { planId: "2", date: "date", personIds: null })',
      'client.run((api) => api.people.candidateDetails({ params: { planId: "2" }, payload: { date: "date", personIds: null } }))',
    ],
    [
      "DELETE context in the query",
      'client.call("schedule.remove", { planPersonId: "1", serviceTypeId: "2", planId: "3" })',
      'client.run((api) => api.schedule.remove({ params: { planPersonId: "1" }, query: { serviceTypeId: "2", planId: "3" } }))',
    ],
  ])("places %s", (_case, source, expected) => {
    expect(rewrite(source)).toMatchObject({ source: expected, skipped: [] });
  });

  it("avoids shadowing a source name", () => {
    expect(
      rewrite('client.call("people.search", { query: "api" })').source
    ).toBe(
      'client.run((api1) => api1.people.search({ query: { query: "api" } }))'
    );
  });

  it.each([
    '{ ...nextTarget(), status: "C" }',
    '{ ...target, status: "C" }',
    '{ status: "C", ...target }',
    '{ planId: nextPlan(), planPersonId: nextPerson(), status: "C" }',
    '{ planPersonId: target.planPersonId, planId: target.planId, status: "C" }',
    '{ get planPersonId() { return nextPerson(); }, planId, status: "C" }',
    '{ [nextKey()]: nextPerson(), planId, status: "C" }',
  ])("leaves unsafe input evaluation unchanged: %s", (input) => {
    const source = `client.call("schedule.updateStatus", ${input})`;
    const result = rewrite(source);
    expect(result.source).toBe(source);
    expect(result.rewritten).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({ file: "site.ts", line: 1 });
    expect(rewrite(result.source)).toStrictEqual(result);
  });

  it.each([
    'client.call("people.search", { ...nextSearch() }, nextOptions())',
    'client.call("people.search", input, nextOptions())',
    'client.call("health", undefined, options)',
    'client.call("people.search", { query: /q/ }, options)',
    'client.call("people.search", { query: { nested: true } }, options)',
    'client.call("people.search", { query }, options)',
    'client.call("people.search", { query: state.query }, options)',
    'client.call("people.search", { query: nextQuery() })',
    'client.call("people.search", { ...input })',
    'client.call("schedule.updateStatus", { planPersonId, planId, status: "C" }, options)',
    'client.call("schedule.updateStatus", input, { get signal() { mutateInput(); } })',
    'client.call("people.search", input, { get httpHeaders() { mutateInput(); } })',
    'getClient().call("people.search", input, nextOptions())',
    'callForQuery(context, (options) => client.call("people.search", input, options))',
    'client.call("health", nextInput(), options)',
    'client?.call("health")',
    '(chooseClient() ? left : right).call("health")',
    '(await nextClient()).call("health")',
    '(client as ProductClient).call("health")',
    '(before(), client).call("health")',
    'client.call?.("health")',
    'client.call("health", {}, ...options)',
  ])("reports eager evaluation for a hand edit: %s", (source) => {
    const result = rewrite(source);
    expect(result.source).toBe(source);
    expect(result.rewritten).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toMatch(/eager|optional|spread/u);
    expect(rewrite(result.source)).toStrictEqual(result);
  });

  it("retains receiver and options evaluation syntax for inert input", () => {
    expect(
      rewrite(
        'getClient().call("people.search", { query: "before" }, nextOptions())'
      )
    ).toMatchObject({
      source:
        'getClient().run((api) => api.people.search({ query: { query: "before" } }), nextOptions())',
      rewritten: 1,
      skipped: [],
    });
    expect(
      rewrite(
        'holder.client.call("people.search", { query: "before" }, { get signal() { mutateInput(); }, get httpHeaders() { mutateInput(); } })'
      )
    ).toMatchObject({
      source:
        'holder.client.run((api) => api.people.search({ query: { query: "before" } }), { get signal() { mutateInput(); }, get httpHeaders() { mutateInput(); } })',
      rewritten: 1,
      skipped: [],
    });
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

  it.each([
    "callForQuery(context, async (options) => await client.run((api) => api.catalog.plans({ params }), options))",
    "callForQuery(nextContext(), (options) => getClient().run((api) => api.people.search({ query }), options))",
    "callForQuery(context, (options) => holder.client.run((api) => api.people.search({ query }), options))",
    "callForQuery(context, function (options) { return client.run((api) => api.people.search({ query }), options); })",
  ])(
    "reports a query wrapper's delayed receiver for a hand edit: %s",
    (source) => {
      const result = rewriteQuerySites("read.ts", source);
      expect(result.source).toBe(source);
      expect(result.rewritten).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]?.reason).toContain("receiver");
      expect(rewriteQuerySites("read.ts", result.source)).toStrictEqual(result);
    }
  );

  it("is idempotent after native conversion", () => {
    const native = rewrite(
      'client.call("people.candidateDetails", { planId: "2", date: "date", personIds: null })'
    ).source;
    expect(rewrite(native)).toStrictEqual({
      source: native,
      rewritten: 0,
      skipped: [],
    });
  });
});
