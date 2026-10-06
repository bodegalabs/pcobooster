import { makeProductClient } from "@pcobooster/client/product-client";
import type { ProductClient } from "@pcobooster/client/product-client";
import type { Json } from "effect/Schema";

import { makeFixtureFetch } from "../harness/fixture-transport";
import type { FeatureOverride, LaunchOptions } from "../harness/launch-options";

/**
 * The API outside fixture mode: pcobooster.com in Release, the local `bun run dev` product origin
 * in development builds (as the Swift app's Debug default).
 */
export const API_ORIGIN = __DEV__
  ? "http://127.0.0.1:3001"
  : "https://pcobooster.com";

const featureOverrides: Record<FeatureOverride, Json> = {
  all: { people: true, chordCharts: true },
  none: { people: false, chordCharts: false },
  people: { people: true, chordCharts: false },
  songs: { people: false, chordCharts: true },
};

/**
 * The product client: the fixture transport behind `-PCOBMock YES` (development builds only),
 * else the API at `API_ORIGIN` with the session's bearer token. Screens see only the client's
 * call shape either way.
 */
export const makeAppClient = (
  options: LaunchOptions,
  /** The signed-in person's bearer token. */
  token: string | null
): ProductClient => {
  if (options.mock) {
    return makeProductClient({
      url: "https://fixtures.invalid/api/rpc",
      client: "expo",
      credentials: "omit",
      fetch: makeFixtureFetch({
        latencyMs: options.mockLatencyMs,
        overrides:
          options.features === null
            ? {}
            : { "features.status": featureOverrides[options.features] },
      }),
    });
  }
  return makeProductClient({
    url: `${API_ORIGIN}/api/rpc`,
    client: "expo",
    credentials: "omit",
    httpHeaders: (): Record<string, string> =>
      token === null ? {} : { authorization: `Bearer ${token}` },
  });
};
