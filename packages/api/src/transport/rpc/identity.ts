import {
  getEnabledFeatures,
  getPlanningCenterAccounts,
  getSessionStatus,
  selectPlanningCenterAccount,
} from "@pcobooster/api/application/identity";
import { executeApplicationEffect } from "@pcobooster/api/transport/rpc/execute";
import { defineHandler } from "@pcobooster/api/transport/rpc/implementation";
import {
  appendSelectedPlanningCenterAccountCookie,
  applyPrivateNoStore,
} from "@pcobooster/api/transport/rpc/response-headers";

const sessionStatus = defineHandler(
  "session.status",
  async ({ context, signal }) => {
    applyPrivateNoStore(context.resHeaders);
    return await executeApplicationEffect(getSessionStatus(), context, signal);
  }
);

const accountsList = defineHandler(
  "accounts.list",
  async ({ context, signal }) => {
    applyPrivateNoStore(context.resHeaders);
    return await executeApplicationEffect(
      getPlanningCenterAccounts(),
      context,
      signal
    );
  }
);

const accountsSelect = defineHandler(
  "accounts.select",
  async ({ input, context, signal }) => {
    applyPrivateNoStore(context.resHeaders);
    const result = await executeApplicationEffect(
      selectPlanningCenterAccount(input),
      context,
      signal
    );
    if (!context.server.config.devAuthBypass) {
      appendSelectedPlanningCenterAccountCookie(
        context,
        result.selectedAccountId
      );
    }
    return result;
  }
);

const featuresStatus = defineHandler(
  "features.status",
  async ({ context, signal }) => {
    applyPrivateNoStore(context.resHeaders);
    return await executeApplicationEffect(
      getEnabledFeatures(),
      context,
      signal
    );
  }
);

export const identityRouter = {
  accounts: { list: accountsList, select: accountsSelect },
  features: { status: featuresStatus },
  session: { status: sessionStatus },
};
