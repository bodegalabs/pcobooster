import { getPlanningCenterAccessSnapshot } from "@pcobooster/api/application/access";
import { rpc } from "@pcobooster/api/transport/orpc/implementation";
import { readWithPlanningCenter } from "@pcobooster/api/transport/orpc/planning-center-procedure";
import { applyPrivateNoStore } from "@pcobooster/api/transport/orpc/response-headers";

const me = rpc.access.me.handler(async (call) => {
  applyPrivateNoStore(call.context.resHeaders);
  return await readWithPlanningCenter(getPlanningCenterAccessSnapshot, call);
});

export const accessRouter = { me };
