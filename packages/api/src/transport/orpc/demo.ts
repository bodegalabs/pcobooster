import { startDemoSession } from "@pcobooster/api/application/demo";
import { executeApplicationEffect } from "@pcobooster/api/transport/orpc/execute";
import { rpc } from "@pcobooster/api/transport/orpc/implementation";
import {
  appendDemoSessionCookie,
  applyPrivateNoStore,
} from "@pcobooster/api/transport/orpc/response-headers";

const start = rpc.demo.start.handler(async ({ input, context, signal }) => {
  applyPrivateNoStore(context.resHeaders);
  const { sessionToken } = await executeApplicationEffect(
    startDemoSession(input),
    context,
    signal
  );
  appendDemoSessionCookie(context, sessionToken);
  return { demo: true };
});

const exit = rpc.demo.exit.handler(({ context }) => {
  applyPrivateNoStore(context.resHeaders);
  appendDemoSessionCookie(context, null);
  return { demo: false };
});

export const demoRouter = { start, exit };
