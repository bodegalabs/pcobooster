import {
  makeProductClient,
  TransportFailure,
} from "@pcobooster/client/product-client";
import { ExternalServiceFailure } from "@pcobooster/contracts/faults/external-service-failure";
import { describe, expect, it } from "vitest";

import { makeFixtureFetch } from "../harness/fixture-transport";
import { withApiProbe } from "./probe-transport";
import type { ApiProbe } from "./probe-transport";

const probedClient = (probe: ApiProbe) => {
  const sent: string[] = [];
  const fixtures = makeFixtureFetch({ latencyMs: 0 });
  const client = makeProductClient({
    url: "https://api.test",
    client: "expo",
    credentials: "omit",
    fetch: withApiProbe(async (input, init) => {
      sent.push(new URL(new Request(input, init).url).pathname);
      return await fixtures(input, init);
    }, probe),
  });
  return { client, sent };
};

const failureOf = async (call: Promise<unknown>) => {
  try {
    await call;
    return null;
  } catch (error) {
    return error;
  }
};

describe(withApiProbe, () => {
  it("sends the probed read, answers it with a synthetic 502 once, and leaves everything else alone", async () => {
    const { client, sent } = probedClient("api-5xx");
    await client.run((api) => api.session.status());
    const first = await failureOf(
      client.run((api) => api.catalog.organization())
    );
    const second = await failureOf(
      client.run((api) => api.catalog.organization())
    );
    expect([
      first instanceof ExternalServiceFailure,
      second,
      sent.length,
    ]).toStrictEqual([true, null, 3]);
  });

  it("fails the probed read as undecodable after sending it", async () => {
    const { client, sent } = probedClient("api-undecodable");
    const failure = await failureOf(
      client.run((api) => api.catalog.organization())
    );
    expect([
      failure instanceof TransportFailure && failure.reason,
      sent.length,
    ]).toStrictEqual(["undecodable", 1]);
  });

  it("fails the probed read as a lost connection without sending it", async () => {
    const { client, sent } = probedClient("api-network");
    const failure = await failureOf(
      client.run((api) => api.catalog.organization())
    );
    expect([
      failure instanceof TransportFailure && failure.reason,
      sent.length,
    ]).toStrictEqual(["network", 0]);
  });
});
