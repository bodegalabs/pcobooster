import { makeProductClient } from "@pcobooster/client/product-client";
import { ProductRpc } from "@pcobooster/contracts/rpc/product";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  fixtures,
  makeFixtureFetch,
  matchesFixture,
} from "./fixture-transport";

const fixtureClient = () =>
  makeProductClient({
    url: "https://fixtures.invalid/api/rpc",
    client: "expo",
    credentials: "omit",
    fetch: makeFixtureFetch({ latencyMs: 0 }),
  });

describe("the copied fixtures", () => {
  it.each([...fixtures])(
    "%s decodes as the procedure's success",
    (tag, file) => {
      const rpc = ProductRpc.requests.get(tag);
      expect(rpc).toBeDefined();
      const decode = Schema.decodeUnknownSync(
        Schema.toCodecJson(rpc?.successSchema ?? Schema.Never)
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
    const plans = await client.call("catalog.plans", { serviceTypeId: "1102" });
    expect(plans[0]?.sortDate).toBeInstanceOf(Date);
    expect(plans.map((plan) => plan.title)).toContain("Is God Good?");
    await client.dispose();
  });

  it("answers the default when no case matches", async () => {
    const client = fixtureClient();
    const types = await client.call("catalog.serviceTypes", {});
    expect(types.map((type) => type.name)).toStrictEqual([
      "Sunday Gathering",
      "Youth Night",
      "Special Events",
    ]);
    await client.dispose();
  });
});
