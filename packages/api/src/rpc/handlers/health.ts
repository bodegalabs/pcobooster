import { Server } from "@pcobooster/api/server";
import { healthRpc } from "@pcobooster/contracts/rpc/product";
import { Effect } from "effect";

export const HealthHandlers = healthRpc.toLayer({
  health: () =>
    Server.pipe(
      Effect.map(({ config }) => ({
        status: "ok" as const,
        version: config.releaseVersion,
      }))
    ),
});
