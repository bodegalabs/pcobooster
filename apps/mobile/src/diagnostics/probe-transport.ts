/**
 * The API probes of an internal verification build (`probes.ts`): the first
 * `catalog.organization` request of the launch fails in a chosen way, and every other request
 * goes through untouched. That read only sets the congregation's time zone, so the app keeps
 * working on the fallback zone.
 *
 * - `api-5xx` sends the real request, so the Worker logs its request ID, then hands the app a
 *   synthetic 502 instead of the answer. The report's `request_id` finds that Worker line.
 * - `api-undecodable` does the same with a page the client cannot decode.
 * - `api-network` fails as a lost connection without sending anything; no Worker line exists.
 */
import { procedureRoutes } from "@pcobooster/contracts/http/api";
import { matchRoute } from "@pcobooster/contracts/http/route";

import { syntheticBadGateway, syntheticUndecodable } from "./synthetic-answers";

export type ApiProbe = "api-5xx" | "api-undecodable" | "api-network";

const PROBED_PROCEDURE = "catalog.organization";

export const withApiProbe = (
  send: typeof globalThis.fetch,
  probe: ApiProbe
): typeof globalThis.fetch => {
  let probed = false;
  return async (input, init) => {
    const request = new Request(input, init);
    const match = matchRoute(
      procedureRoutes,
      request.method,
      new URL(request.url).pathname
    );
    if (
      probed ||
      match.kind !== "found" ||
      match.route.tag !== PROBED_PROCEDURE
    ) {
      return await send(input, init);
    }
    probed = true;
    if (probe === "api-network") {
      throw new TypeError("Network request failed");
    }
    await send(input, init);
    return probe === "api-5xx" ? syntheticBadGateway() : syntheticUndecodable();
  };
};
