import { getPlanningCenterAccessSnapshot } from "@pcobooster/api/application/access";
import { defineHandler } from "@pcobooster/api/transport/rpc/implementation";
import { readWithPlanningCenter } from "@pcobooster/api/transport/rpc/planning-center-procedure";
import { applyPrivateNoStore } from "@pcobooster/api/transport/rpc/response-headers";

const me = defineHandler("access.me", async (call) => {
  applyPrivateNoStore(call.context.resHeaders);
  return await readWithPlanningCenter(getPlanningCenterAccessSnapshot, call);
});

export const accessRouter = { me };
