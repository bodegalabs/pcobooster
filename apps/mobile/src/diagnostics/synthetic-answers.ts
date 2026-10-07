/**
 * Answers the API never sent, for the diagnostics probes of an internal verification build
 * (`probes.ts`) and for tests: a 502 the client decodes as `ExternalServiceFailure`, and a
 * gateway-style HTML page it cannot decode.
 */
import { productFaultSchema } from "@pcobooster/contracts/faults";
import { ExternalServiceFailure } from "@pcobooster/contracts/faults/external-service-failure";
import { Schema } from "effect";

const BAD_GATEWAY = 502;

export const syntheticBadGateway = (): Response =>
  Response.json(
    Schema.encodeSync(Schema.toCodecJson(productFaultSchema))(
      new ExternalServiceFailure({
        message: "Diagnostics probe: synthetic bad gateway",
        service: "diagnostics-probe",
        cause: null,
      })
    ),
    { status: BAD_GATEWAY, headers: { "cache-control": "no-store" } }
  );

export const syntheticUndecodable = (): Response =>
  new Response("<html><body>Diagnostics probe</body></html>", {
    status: 200,
    headers: { "content-type": "text/html" },
  });
