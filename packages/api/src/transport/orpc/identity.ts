import {
  getAdminAccounts,
  getAdminUser,
  getFeature,
  getPlanningCenterAccounts,
  getSessionStatus,
  selectPlanningCenterAccount,
} from "@pcobooster/api/application/identity";
import { executeApplicationEffect } from "@pcobooster/api/transport/orpc/execute";
import {
  applicationRuntime,
  rpc,
} from "@pcobooster/api/transport/orpc/implementation";
import {
  appendSelectedPlanningCenterAccountCookie,
  applyPrivateNoStore,
} from "@pcobooster/api/transport/orpc/response-headers";

const sessionStatus = rpc.session.status.handler(
  async ({ context, signal }) => {
    applyPrivateNoStore(context.resHeaders);
    return await executeApplicationEffect(
      applicationRuntime,
      getSessionStatus(),
      context,
      signal
    );
  }
);

const accountsList = rpc.accounts.list.handler(async ({ context, signal }) => {
  applyPrivateNoStore(context.resHeaders);
  return await executeApplicationEffect(
    applicationRuntime,
    getPlanningCenterAccounts(),
    context,
    signal
  );
});

const accountsSelect = rpc.accounts.select.handler(
  async ({ input, context, signal }) => {
    applyPrivateNoStore(context.resHeaders);
    const result = await executeApplicationEffect(
      applicationRuntime,
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

const peopleFeature = rpc.features.people.handler(
  async ({ context, signal }) => {
    applyPrivateNoStore(context.resHeaders);
    return await executeApplicationEffect(
      applicationRuntime,
      getFeature("people"),
      context,
      signal
    );
  }
);

const cleanupFeature = rpc.features.cleanup.handler(
  async ({ context, signal }) => {
    applyPrivateNoStore(context.resHeaders);
    return await executeApplicationEffect(
      applicationRuntime,
      getFeature("cleanup"),
      context,
      signal
    );
  }
);

const adminAccounts = rpc.admin.accounts.handler(
  async ({ context, signal }) => {
    applyPrivateNoStore(context.resHeaders);
    return await executeApplicationEffect(
      applicationRuntime,
      getAdminAccounts,
      context,
      signal
    );
  }
);

const adminUser = rpc.admin.user.handler(async ({ input, context, signal }) => {
  applyPrivateNoStore(context.resHeaders);
  return await executeApplicationEffect(
    applicationRuntime,
    getAdminUser(input),
    context,
    signal
  );
});

export const identityRouter = {
  accounts: { list: accountsList, select: accountsSelect },
  admin: { accounts: adminAccounts, user: adminUser },
  features: { people: peopleFeature, cleanup: cleanupFeature },
  session: { status: sessionStatus },
};
