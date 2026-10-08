import { makeProductClient } from "@pcobooster/client/product-client";
import { RequestRejected } from "@pcobooster/contracts/faults/request-rejected";
import {
  procedureRoutes,
  ProductWireApi,
} from "@pcobooster/contracts/http/api";
import {
  API_VERSION,
  SERVER_VERSION_HEADER,
} from "@pcobooster/contracts/http/client-version";
import { Function, Schema } from "effect";
import type { Json } from "effect/Schema";
import { HttpApi } from "effect/unstable/httpapi";
import { describe, expect, it } from "vitest";

import {
  fixtures,
  makeFixtureFetch,
  matchesFixture,
} from "./fixture-transport";

const successSchemas = new Map<string, Schema.Top>();
HttpApi.reflect(ProductWireApi, {
  onGroup: Function.constVoid,
  onEndpoint: ({ group, endpoint }) => {
    const [success] = endpoint.success;
    if (success !== undefined) {
      successSchemas.set(`${group.identifier}.${endpoint.identifier}`, success);
    }
  },
});

const fixtureClient = () =>
  makeProductClient({
    url: "https://fixtures.invalid",
    client: "expo",
    credentials: "omit",
    fetch: makeFixtureFetch({ latencyMs: 0 }),
  });

describe("the copied fixtures", () => {
  it.each([...fixtures])(
    "%s decodes as the procedure's success",
    (tag, file) => {
      const success = successSchemas.get(tag);
      expect(success).toBeDefined();
      const decode = Schema.decodeUnknownSync(
        Schema.toEncoded(Schema.toCodecJson(success ?? Schema.Never))
      );
      for (const output of [
        file.default,
        ...(file.cases ?? []).map((entry) => entry.output),
      ]) {
        expect(() => decode(output)).not.toThrow();
      }
    }
  );
});

describe(matchesFixture, () => {
  it("matches an input that contains the case, with instants compared as instants", () => {
    expect(matchesFixture({ id: "1" }, { id: "1", extra: true })).toBeTruthy();
    expect(
      matchesFixture(
        { at: "2026-10-04T16:00:00Z" },
        { at: "2026-10-04T16:00:00.000Z" }
      )
    ).toBeTruthy();
    expect(matchesFixture({ id: "1" }, { id: "2" })).toBeFalsy();
    expect(matchesFixture({ ids: ["1"] }, { ids: ["1", "2"] })).toBeFalsy();
  });
});

describe(makeFixtureFetch, () => {
  it("answers the real client with the case that matches the call", async () => {
    const client = fixtureClient();
    const plans = await client.run((api) =>
      api.catalog.plans({ params: { serviceTypeId: "1102" } })
    );
    expect(plans[0]?.sortDate).toBeInstanceOf(Date);
    expect(plans.map((plan) => plan.title)).toContain("Is God Good?");
  });

  it("answers the default when no case matches", async () => {
    const client = fixtureClient();
    const types = await client.run((api) => api.catalog.serviceTypes());
    expect(types.map((type) => type.name)).toStrictEqual([
      "Sunday Gathering",
      "Youth Night",
      "Special Events",
    ]);
  });
});

const decodeScalar = Schema.decodeUnknownSync(
  Schema.Union([Schema.String, Schema.Number, Schema.Boolean, Schema.Null])
);
const wireScalar = (value: Json): string => String(decodeScalar(value));

const fixtureCases = [...fixtures].flatMap(([tag, file]) =>
  (file.cases ?? []).map((scenario, index) => ({ tag, index, scenario }))
);

describe("fixture HTTP parity", () => {
  it.each(fixtureCases)(
    "$tag case $index keeps the Swift scenario over HTTP",
    async ({ tag, scenario }) => {
      const route = procedureRoutes.find((entry) => entry.tag === tag);
      if (route === undefined) {
        throw new Error(`Missing declared route for ${tag}`);
      }
      const input = Schema.decodeUnknownSync(
        Schema.Record(Schema.String, Schema.Json)
      )(scenario.match);
      let pathname: string = route.path;
      for (const key of route.params) {
        pathname = pathname.replace(
          `:${key}`,
          encodeURIComponent(wireScalar(input[key] ?? "fixture-id"))
        );
      }
      const url = new URL(pathname, "https://fixtures.invalid");
      const remaining = Object.fromEntries(
        Object.entries(input).filter(([key]) => !route.params.includes(key))
      );
      if (route.input === "query") {
        for (const [key, value] of Object.entries(remaining)) {
          for (const item of Array.isArray(value)
            ? Schema.decodeUnknownSync(Schema.Array(Schema.Json))(value)
            : [value]) {
            url.searchParams.append(key, wireScalar(item));
          }
        }
      }
      const request: RequestInit = { method: route.method };
      if (route.input === "body") {
        request.body = JSON.stringify(remaining);
      }
      const response = await makeFixtureFetch({ latencyMs: 0 })(url, request);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toStrictEqual(scenario.output);
    }
  );

  it("merges decoded path and query values for scenario matching", async () => {
    const plans = await fixtureClient().run((api) =>
      api.catalog.adjacentPlans({
        params: { serviceTypeId: "1101", planId: "881260830" },
        query: { direction: "previous" },
      })
    );
    expect(plans[0]?.title).toBe("Everything That Breathes");
  });

  it("keeps repeated query keys as arrays instead of choosing one value", async () => {
    const fetch = makeFixtureFetch({ latencyMs: 0 });
    const response = await fetch(
      "https://fixtures.invalid/api/v1/service-types/1101/plans/881260830/adjacent?direction=previous&direction=next"
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual([]);
  });

  it("decodes escaped path parameters before selecting a scenario", async () => {
    const response = await makeFixtureFetch({ latencyMs: 0 })(
      "https://fixtures.invalid/api/v1/service-types/1101/plans/%38%38%31%32%36%30%38%33%30/adjacent?direction=previous"
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject([
      { title: "Everything That Breathes" },
      {},
      {},
      {},
    ]);
  });

  it("answers synthetic PATCH and DELETE writes as ordinary JSON", async () => {
    const client = fixtureClient();
    const [item] = await client.run((api) =>
      api.planItems.list({
        params: { serviceTypeId: "1101", planId: "881260830" },
      })
    );
    const updated = await client.run((api) =>
      api.planItems.update({
        params: {
          serviceTypeId: "1101",
          planId: "881260830",
          itemId: item.id,
        },
        payload: { title: "Changed" },
      })
    );
    expect(updated).toMatchObject({ id: item.id, title: "Changed" });
    const removed = await client.run((api) =>
      api.schedule.remove({
        params: { planPersonId: "member-1" },
        query: { planId: "881260830" },
      })
    );
    expect(removed.success).toBeTruthy();
  });

  it("returns typed request faults for unknown routes and wrong methods", async () => {
    const fetch = makeFixtureFetch({ latencyMs: 0 });
    const unknown = await fetch("https://fixtures.invalid/api/v1/unknown");
    expect(unknown.status).toBe(400);
    await expect(unknown.json()).resolves.toMatchObject({
      _tag: "RequestRejected",
      reason: "unknown-endpoint",
    });
  });

  it("answers wrong methods with Allow and response policy headers", async () => {
    const fetch = makeFixtureFetch({ latencyMs: 0 });
    const wrong = await fetch("https://fixtures.invalid/api/v1/service-types", {
      method: "POST",
    });
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get("allow")).toBe("GET");
    expect(wrong.headers.get("cache-control")).toBe("private, no-store");
    expect(wrong.headers.get(SERVER_VERSION_HEADER)).toBe(String(API_VERSION));
  });

  it("rejects malformed JSON with a catchable fault in the native client", async () => {
    const fetch = makeFixtureFetch({ latencyMs: 0 });
    const response = await fetch(
      "https://fixtures.invalid/api/v1/service-types/st/plans/p/items/i",
      { method: "PATCH", body: "{" }
    );
    expect(response.status).toBe(400);
    const fault = Schema.decodeUnknownSync(Schema.toCodecJson(RequestRejected))(
      await response.json()
    );
    expect(fault).toBeInstanceOf(RequestRejected);
    expect(fault.reason).toBe("malformed-request");
  });

  it("cancels simulated latency with the request signal", async () => {
    const controller = new AbortController();
    const client = makeProductClient({
      url: "https://fixtures.invalid",
      client: "expo",
      fetch: makeFixtureFetch({ latencyMs: 1000 }),
    });
    const response = client.run((api) => api.catalog.serviceTypes(), {
      signal: controller.signal,
    });
    controller.abort();
    await expect(response).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("fixture writes", () => {
  const plan = { serviceTypeId: "1101", planId: "881261004" };
  const slot = { ...plan, teamId: "2201", positionId: "3301" };
  const date = "2026-10-04T16:00:00.000Z";
  const historyRows = async (
    client: ReturnType<typeof fixtureClient>,
    planPersonId: string
  ) => {
    const targetClientNative1 = client;
    const inputNative1 = { date };
    const history = await targetClientNative1.run((api) =>
      api.people.planWindowHistory({ payload: inputNative1 })
    );
    return history.people.flatMap((person) =>
      person.rows.filter((row) => row.id === planPersonId)
    );
  };
  const slotOf = async (
    client: ReturnType<typeof fixtureClient>,
    personId: string
  ) => {
    const targetClientNative2 = client;
    const inputNative2 = slot;
    const { candidates } = await targetClientNative2.run((api) =>
      api.people.positionCandidates({
        params: inputNative2,
        query: inputNative2,
      })
    );
    return candidates.find((candidate) => candidate.id === personId)
      ?.selectedPlanSlot;
  };

  it("carry into candidate and history reads, as Planning Center's do", async () => {
    const client = fixtureClient();
    const targetClientNative3 = client;
    const inputNative3 = plan;
    await targetClientNative3.run((api) =>
      api.catalog.teamPositions({
        params: inputNative3,
        query: {},
      })
    );
    const targetClientNative4 = client;
    const inputNative4 = {
      ...plan,
      planPersonId: "881261004001",
      status: "D" as const,
    };
    await targetClientNative4.run((api) =>
      api.schedule.updateStatus({ params: inputNative4, payload: inputNative4 })
    );
    const declined = await slotOf(client, "4100104");
    const declinedRows = await historyRows(client, "881261004001");
    expect({
      slot: declined?.status,
      rows: declinedRows.map((row) => row.status),
    }).toStrictEqual({ slot: "declined", rows: ["D"] });
    const targetClientNative5 = client;
    const inputNative5 = {
      ...plan,
      planPersonId: "881261004001",
    };
    await targetClientNative5.run((api) =>
      api.schedule.remove({ params: inputNative5, query: inputNative5 })
    );
    const removed = await slotOf(client, "4100104");
    const removedRows = await historyRows(client, "881261004001");
    expect({ slot: removed, rows: removedRows }).toStrictEqual({
      slot: null,
      rows: [],
    });
    const targetClientNative6 = client;
    const inputNative6 = {
      ...slot,
      personId: "4100102",
      teamName: "Band",
      positionName: "Acoustic Guitar",
      oneOff: false,
    };
    const { data } = await targetClientNative6.run((api) =>
      api.schedule.assign({ params: inputNative6, payload: inputNative6 })
    );
    await expect(slotOf(client, "4100102")).resolves.toStrictEqual({
      planPersonId: data.id,
      status: "pending",
      declineReason: null,
    });
  });
});
