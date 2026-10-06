/** The caller's Planning Center accounts, and which one acts. */
import { read, write } from "@pcobooster/contracts/http/endpoint";
import { plainGroup } from "@pcobooster/contracts/http/group";
import { planningCenterIdentitySchema } from "@pcobooster/contracts/http/identity";
import { mutableArray, requiredId } from "@pcobooster/contracts/http/schema";
import { Schema } from "effect";

export const planningCenterAccountSchema = Schema.Struct({
  id: Schema.String,
  providerId: Schema.String,
  updatedAt: Schema.String,
  identity: Schema.NullOr(planningCenterIdentitySchema),
});

export const planningCenterAccountsSchema = Schema.Struct({
  session: Schema.Struct({
    userId: Schema.String,
    name: Schema.String,
    email: Schema.String,
    image: Schema.NullOr(Schema.String),
  }),
  selectedAccountId: Schema.NullOr(Schema.String),
  accounts: mutableArray(planningCenterAccountSchema),
  /** A read-only demo session backed by the demo organization. */
  demo: Schema.Boolean,
});

export const accountsSelectInputSchema = Schema.Struct({
  accountId: requiredId,
});

export const accountSwitchSchema = Schema.Struct({
  success: Schema.Literal(true),
  selectedAccountId: Schema.String,
});

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
