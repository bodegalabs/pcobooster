/** Account procedures over Effect RPC. Ported from the zod schemas in `../accounts.ts`. */
import { plainGroup } from "@pcobooster/contracts/rpc/group";
import { planningCenterIdentitySchema } from "@pcobooster/contracts/rpc/identity";
import { read, write } from "@pcobooster/contracts/rpc/procedure";
import { mutableArray, requiredId } from "@pcobooster/contracts/rpc/schema";
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

export const accountsList = read("accounts.list", {
  payload: Schema.Struct({}),
  success: planningCenterAccountsSchema,
});

/** Also sets the selected-account cookie (except under the dev auth bypass). */
export const accountsSelect = write("accounts.select", {
  payload: accountsSelectInputSchema,
  success: accountSwitchSchema,
});

export const accountsProcedures = [accountsList, accountsSelect] as const;
export const accountsRpc = plainGroup(...accountsProcedures);
