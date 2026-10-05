import { RpcError } from "@pcobooster/contracts/errors";
import { planningCenterIdentitySchema } from "@pcobooster/contracts/identity";
import { Schema, Struct } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

export const planningCenterAccountSchema = Schema.Struct({
  id: Schema.String,
  providerId: Schema.String,
  updatedAt: Schema.String,
  identity: Schema.NullOr(planningCenterIdentitySchema),
}).mapFields(Struct.map(Schema.mutableKey));

export const planningCenterAccountsSchema = Schema.Struct({
  session: Schema.Struct({
    userId: Schema.String,
    name: Schema.String,
    email: Schema.String,
    image: Schema.NullOr(Schema.String),
  }).mapFields(Struct.map(Schema.mutableKey)),
  selectedAccountId: Schema.NullOr(Schema.String),
  accounts: Schema.mutable(Schema.Array(planningCenterAccountSchema)),
  /** A read-only demo session backed by the demo organization. */
  demo: Schema.Boolean,
}).mapFields(Struct.map(Schema.mutableKey));

export const accountsListInputSchema = Schema.Struct({}).mapFields(
  Struct.map(Schema.mutableKey)
);

export const accountsSelectInputSchema = Schema.Struct({
  accountId: Schema.Trim.check(Schema.isMinLength(1)),
}).mapFields(Struct.map(Schema.mutableKey));

export const accountSwitchSchema = Schema.Struct({
  success: Schema.Literal(true),
  selectedAccountId: Schema.String,
}).mapFields(Struct.map(Schema.mutableKey));

export const accountsRpc = RpcGroup.make(
  Rpc.make("accounts.list", {
    payload: accountsListInputSchema,
    success: planningCenterAccountsSchema,
    error: RpcError,
  }),
  Rpc.make("accounts.select", {
    payload: accountsSelectInputSchema,
    success: accountSwitchSchema,
    error: RpcError,
  })
);

export type PlanningCenterAccount = typeof planningCenterAccountSchema.Type;

export type PlanningCenterAccountsResponse =
  typeof planningCenterAccountsSchema.Type;

export type AccountsSelectInput = typeof accountsSelectInputSchema.Encoded;
