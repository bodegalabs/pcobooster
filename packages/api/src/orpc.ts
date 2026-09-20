import { implement } from "@orpc/server";
import { RequestContext } from "@worship-admin/api/application/context";
import { createApplicationRuntime } from "@worship-admin/api/application/runtime";
import type { RpcContext } from "@worship-admin/api/transport/orpc/context";
import { executeApplicationEffect } from "@worship-admin/api/transport/orpc/execute";
import { appContract } from "@worship-admin/contracts";
import { Effect, Layer } from "effect";

const applicationRuntime = createApplicationRuntime(Layer.empty);
const rpc = implement(appContract).$context<RpcContext>();

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
  health,
});

export type AppRouter = typeof appRouter;

export const disposeApplicationRuntime = async (): Promise<void> => {
  await applicationRuntime.dispose();
};
