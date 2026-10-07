import { MAX_READ_RETRIES } from "@pcobooster/client/query";
/**
 * The API probes of an internal verification build (`probes.ts`): the launch's first
 * `catalog.organization` read fails in a chosen way, every attempt of it, through its automatic
 * retry, so the query cache sees a terminal failure and reports it once. Later requests, and
 * every other request, go through untouched; the app's retry behavior is unchanged. That read only
 * sets the congregation's time zone, so the app keeps working on the fallback zone.
 *
 * - `api-5xx` sends each attempt's real request, so the Worker logs its request ID, then hands
 *   the app a synthetic 502 instead of the answer. The report's `request_id` is the last
 *   attempt's and finds that Worker line.
 * - `api-undecodable` does the same with a page the client cannot decode.
 * - `api-network` fails as a lost connection without sending anything; no Worker line exists.
 * - `api-5xx-transient` fails only the first attempt with a 502; the retry is answered for real,
 *   so nothing is reported.
 */
import { procedureRoutes } from "@pcobooster/contracts/http/api";
import { matchRoute } from "@pcobooster/contracts/http/route";

import { syntheticBadGateway, syntheticUndecodable } from "./synthetic-answers";

export type ApiProbe =
  | "api-5xx"
  | "api-undecodable"
  | "api-network"
  | "api-5xx-transient";

const PROBED_PROCEDURE = "catalog.organization";

/** Every attempt of one read: the first and each automatic retry. */
const READ_ATTEMPTS = MAX_READ_RETRIES + 1;

export const withApiProbe = (
  send: typeof globalThis.fetch,
  probe: ApiProbe
): typeof globalThis.fetch => {
  let remaining = probe === "api-5xx-transient" ? 1 : READ_ATTEMPTS;
  return async (input, init) => {
    const request = new Request(input, init);
    const match = matchRoute(
      procedureRoutes,
      request.method,
      new URL(request.url).pathname
    );
    if (
      remaining === 0 ||
      match.kind !== "found" ||
      match.route.tag !== PROBED_PROCEDURE
    ) {
      return await send(input, init);
    }
    remaining -= 1;
    if (probe === "api-network") {
      throw new TypeError("Network request failed");
    }
    await send(input, init);
    return probe === "api-undecodable"
      ? syntheticUndecodable()
      : syntheticBadGateway();
  };
};
