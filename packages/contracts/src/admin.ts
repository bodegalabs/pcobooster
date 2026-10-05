import { planningCenterIdentitySchema } from "@pcobooster/contracts/identity";
import { Schema, Struct } from "effect";

export const adminAccountActivitySchema = Schema.Struct({
  userId: Schema.String,
  name: Schema.String,
  email: Schema.String,
  image: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  linkedAccounts: Schema.Finite,
  providers: Schema.mutable(Schema.Array(Schema.String)),
  activeSessions: Schema.Finite,
  loginEvents: Schema.Finite,
  loginEvents7d: Schema.Finite,
  loginEvents30d: Schema.Finite,
  signOutEvents: Schema.Finite,
  activityEvents: Schema.Finite,
  firstLoginAt: Schema.NullOr(Schema.String),
  lastLoginAt: Schema.NullOr(Schema.String),
  lastActivityAt: Schema.NullOr(Schema.String),
}).mapFields(Struct.map(Schema.mutableKey));

export type AdminAccountActivity = typeof adminAccountActivitySchema.Type;

export const adminLinkedAccountSchema = Schema.Struct({
  id: Schema.String,
  providerAccountId: Schema.String,
  providerId: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  scope: Schema.NullOr(Schema.String),
  accessTokenExpiresAt: Schema.NullOr(Schema.String),
  refreshTokenExpiresAt: Schema.NullOr(Schema.String),
  activityEvents: Schema.Finite,
  linkedEvents: Schema.Finite,
  firstActivityAt: Schema.NullOr(Schema.String),
  lastActivityAt: Schema.NullOr(Schema.String),
  identity: Schema.NullOr(planningCenterIdentitySchema),
}).mapFields(Struct.map(Schema.mutableKey));

export type AdminLinkedAccount = typeof adminLinkedAccountSchema.Type;

export const adminUserAccountDetailSchema = Schema.Struct({
  ...adminAccountActivitySchema.fields,
  linkedAccountDetails: Schema.mutable(Schema.Array(adminLinkedAccountSchema)),
}).mapFields(Struct.map(Schema.mutableKey));

export type AdminUserAccountDetail = typeof adminUserAccountDetailSchema.Type;

export const adminAccountsResponseSchema = Schema.Struct({
  /** Who Cloudflare Access signed in; null where no Access runs (local development). */
  email: Schema.NullOr(Schema.String),
  accounts: Schema.mutable(Schema.Array(adminAccountActivitySchema)),
}).mapFields(Struct.map(Schema.mutableKey));

export const adminUserResponseSchema = Schema.Struct({
  user: Schema.NullOr(adminUserAccountDetailSchema),
}).mapFields(Struct.map(Schema.mutableKey));

export const adminUserInputSchema = Schema.Struct({
  userId: Schema.Trim.check(Schema.isMinLength(1)),
}).mapFields(Struct.map(Schema.mutableKey));

export type AdminUserInput = typeof adminUserInputSchema.Encoded;

export type AdminAccountsResponse = typeof adminAccountsResponseSchema.Type;

export type AdminUserResponse = typeof adminUserResponseSchema.Type;
