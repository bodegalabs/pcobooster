import { startDemoSession } from "@pcobooster/api/application/demo";
import { executeApplicationEffect } from "@pcobooster/api/transport/orpc/execute";
import {
  applicationRuntime,
  rpc,
} from "@pcobooster/api/transport/orpc/implementation";
import {
  appendDemoSessionCookie,
  applyPrivateNoStore,
} from "@pcobooster/api/transport/orpc/response-headers";

const start = rpc.demo.start.handler(async ({ input, context, signal }) => {
  applyPrivateNoStore(context.resHeaders);
  const { sessionToken } = await executeApplicationEffect(
    applicationRuntime,
    startDemoSession(input),
    context,
    signal
  );
  appendDemoSessionCookie(context.resHeaders, sessionToken);
  return { demo: true };
});

const exit = rpc.demo.exit.handler(({ context }) => {
  applyPrivateNoStore(context.resHeaders);
  appendDemoSessionCookie(context.resHeaders, null);
  return { demo: false };
});

export const demoRouter = { start, exit };
