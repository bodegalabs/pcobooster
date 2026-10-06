import {
  getEnabledFeatures,
  getPlanningCenterAccounts,
  getSessionStatus,
  selectPlanningCenterAccount,
} from "@pcobooster/api/application/identity";
import {
  selectedAccountCookie,
  setResponseCookie,
} from "@pcobooster/api/rpc/response-cookies";
import { Server } from "@pcobooster/api/server";
import { accountsRpc } from "@pcobooster/contracts/rpc/accounts";
import { featuresRpc } from "@pcobooster/contracts/rpc/features";
import { sessionRpc } from "@pcobooster/contracts/rpc/session";
import { Effect, Layer } from "effect";

export const IdentityHandlers = Layer.mergeAll(
  sessionRpc.toLayer({
    "session.status": () => getSessionStatus(),
  }),
  accountsRpc.toLayer({
    "accounts.list": () => getPlanningCenterAccounts(),
    "accounts.select": (input) =>
      Effect.gen(function* selectAccount() {
        const result = yield* selectPlanningCenterAccount(input);
        // The dev auth bypass always acts as its one account, so there is nothing to remember.
        if (!(yield* Server).config.devAuthBypass) {
          yield* setResponseCookie((secure) =>
            selectedAccountCookie(result.selectedAccountId, secure)
          );
        }
        return result;
      }),
  }),
  featuresRpc.toLayer({
    "features.status": () => getEnabledFeatures(),
  })
);
