import { Server } from "@pcobooster/api/server";
import { ProductApi } from "@pcobooster/contracts/http/api";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

export const HealthHandlers = HttpApiBuilder.group(
  ProductApi,
  "health",
  (handlers) =>
    handlers.handle("get", () =>
      Server.pipe(
        Effect.map(({ config }) => ({
          status: "ok" as const,
          version: config.releaseVersion,
        }))
      )
    )
);
