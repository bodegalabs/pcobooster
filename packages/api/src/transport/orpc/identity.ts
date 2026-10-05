import {
  getEnabledFeatures,
  getPlanningCenterAccounts,
  getSessionStatus,
  selectPlanningCenterAccount,
} from "@pcobooster/api/application/identity";
import { executeApplicationEffect } from "@pcobooster/api/transport/orpc/execute";
import { rpc } from "@pcobooster/api/transport/orpc/implementation";
import {
  appendSelectedPlanningCenterAccountCookie,
  applyPrivateNoStore,
} from "@pcobooster/api/transport/orpc/response-headers";

const sessionStatus = rpc.session.status.handler(
  async ({ context, signal }) => {
    applyPrivateNoStore(context.resHeaders);
    return await executeApplicationEffect(getSessionStatus(), context, signal);
  }
);

const accountsList = rpc.accounts.list.handler(async ({ context, signal }) => {
  applyPrivateNoStore(context.resHeaders);
  return await executeApplicationEffect(
    getPlanningCenterAccounts(),
    context,
    signal
  );
});

const accountsSelect = rpc.accounts.select.handler(
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

const featuresStatus = rpc.features.status.handler(
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
