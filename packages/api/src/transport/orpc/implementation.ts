import { implement } from "@orpc/server";
import type { RpcContext } from "@pcobooster/api/transport/orpc/context";
import { accountPlanningCenterProcedure } from "@pcobooster/api/transport/orpc/planning-center-accounting";
import { appContract } from "@pcobooster/contracts";
import {
  parseRequestPriority,
  REQUEST_PRIORITY_HEADER,
} from "@pcobooster/contracts/request-priority";
/**
 * Every procedure counts its Planning Center requests and logs one summary. The browser marks
 * prefetches and warm-ups speculative, and the pacer holds those back first.
 */
export const rpc = implement(appContract)
  .$context<RpcContext>()
  .use(async ({ context, next, path }) => {
    const procedure = path.join(".");
    return await accountPlanningCenterProcedure(
      {
        procedure,
        requestId: context.requestId,
        priority: parseRequestPriority(
          context.request.headers.get(REQUEST_PRIORITY_HEADER)
        ),
        accounting: context.planningCenterAccounting,
      },
      async (accounting) =>
        await next({
          context: { planningCenterAccounting: accounting, procedure },
        })
    );
  });
