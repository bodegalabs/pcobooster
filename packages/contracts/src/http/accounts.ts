/** The caller's Planning Center accounts, and which one acts. */
import { read, write } from "@pcobooster/contracts/http/endpoint";
import { plainGroup } from "@pcobooster/contracts/http/group";
import {
  accountSwitchSchema,
  accountsSelectInputSchema,
  planningCenterAccountsSchema,
} from "@pcobooster/contracts/rpc/accounts";

export const accounts = plainGroup(
  "accounts",
  read("accounts.list", "/accounts", {
    params: {},
    query: {},
    success: planningCenterAccountsSchema,
  }),
  /** Also sets the selected-account cookie (except under the dev auth bypass). */
  write.put("accounts.select", "/accounts/selected", {
    params: {},
    payload: accountsSelectInputSchema.fields,
    success: accountSwitchSchema,
  })
);
