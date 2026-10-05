import { startDemoSession } from "@pcobooster/api/application/demo";
import { executeApplicationEffect } from "@pcobooster/api/transport/rpc/execute";
import { defineHandler } from "@pcobooster/api/transport/rpc/implementation";
import {
  appendDemoSessionCookie,
  applyPrivateNoStore,
} from "@pcobooster/api/transport/rpc/response-headers";

const start = defineHandler(
  "demo.start",
  async ({ input, context, signal }) => {
    applyPrivateNoStore(context.resHeaders);
    const { sessionToken } = await executeApplicationEffect(
      startDemoSession(input),
      context,
      signal
    );
    appendDemoSessionCookie(context, sessionToken);
    return { demo: true, sessionToken };
  }
);

const exit = defineHandler("demo.exit", ({ context }) => {
  applyPrivateNoStore(context.resHeaders);
  appendDemoSessionCookie(context, null);
  return { demo: false };
});

export const demoRouter = { start, exit };
