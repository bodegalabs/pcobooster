import { RequestContext } from "@worship-admin/api/application/context";
import { catalogRouter } from "@worship-admin/api/transport/orpc/catalog";
import { executeApplicationEffect } from "@worship-admin/api/transport/orpc/execute";
import {
  applicationRuntime,
  rpc,
} from "@worship-admin/api/transport/orpc/implementation";
import { peopleRouter } from "@worship-admin/api/transport/orpc/people";
import { Effect } from "effect";

const health = rpc.health.handler(
  async ({ context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      Effect.as(RequestContext, { status: "ok" as const }),
      context,
      signal
    )
);

export const appRouter = rpc.router({
  catalog: catalogRouter,
  health,
  people: peopleRouter,
});

export type AppRouter = typeof appRouter;

export const disposeApplicationRuntime = async (): Promise<void> => {
  await applicationRuntime.dispose();
};
