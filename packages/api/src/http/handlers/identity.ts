import {
  getEnabledFeatures,
  getPlanningCenterAccounts,
  getSessionStatus,
  selectPlanningCenterAccount,
} from "@pcobooster/api/application/identity";
import {
  selectedAccountCookie,
  setResponseCookie,
} from "@pcobooster/api/http/response-cookies";
import { Server } from "@pcobooster/api/server";
import { ProductApi } from "@pcobooster/contracts/http/api";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

export const IdentityHandlers = Layer.mergeAll(
  HttpApiBuilder.group(ProductApi, "session", (handlers) =>
    handlers.handle("status", () => getSessionStatus())
  ),
  HttpApiBuilder.group(ProductApi, "accounts", (handlers) =>
    handlers
      .handle("list", () => getPlanningCenterAccounts())
      .handle("select", ({ payload }) =>
        Effect.gen(function* selectAccount() {
          const result = yield* selectPlanningCenterAccount(payload);
          // The dev auth bypass always acts as its one account, so there is nothing to remember.
          if (!(yield* Server).config.devAuthBypass) {
            yield* setResponseCookie((secure) =>
              selectedAccountCookie(result.selectedAccountId, secure)
            );
          }
          return result;
        })
      )
  ),
  HttpApiBuilder.group(ProductApi, "features", (handlers) =>
    handlers.handle("status", () => getEnabledFeatures())
  )
);
