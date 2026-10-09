import { planningCenterIdentitySchema } from "@pcobooster/contracts/http/identity";
import { mutableArray, requiredId } from "@pcobooster/contracts/http/schema";
import { Schema } from "effect";

export const adminAccountActivitySchema = Schema.Struct({
  userId: Schema.String,
  name: Schema.String,
  email: Schema.String,
  image: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  linkedAccounts: Schema.Number,
  providers: mutableArray(Schema.String),
  activeSessions: Schema.Number,
  loginEvents: Schema.Number,
  loginEvents7d: Schema.Number,
  loginEvents30d: Schema.Number,
  signOutEvents: Schema.Number,
  activityEvents: Schema.Number,
  firstLoginAt: Schema.NullOr(Schema.String),
  lastLoginAt: Schema.NullOr(Schema.String),
  lastActivityAt: Schema.NullOr(Schema.String),
});

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
  activityEvents: Schema.Number,
  linkedEvents: Schema.Number,
  firstActivityAt: Schema.NullOr(Schema.String),
  lastActivityAt: Schema.NullOr(Schema.String),
  identity: Schema.NullOr(planningCenterIdentitySchema),
});

export type AdminLinkedAccount = typeof adminLinkedAccountSchema.Type;

export const adminUserAccountDetailSchema = Schema.Struct({
  ...adminAccountActivitySchema.fields,
  linkedAccountDetails: mutableArray(adminLinkedAccountSchema),
});

export type AdminUserAccountDetail = typeof adminUserAccountDetailSchema.Type;

export const adminAccountsResponseSchema = Schema.Struct({
  /** Who Cloudflare Access signed in; null where no Access runs (local development). */
  email: Schema.NullOr(Schema.String),
  accounts: mutableArray(adminAccountActivitySchema),
});

export const adminUserResponseSchema = Schema.Struct({
  user: Schema.NullOr(adminUserAccountDetailSchema),
});

export const adminUserInputSchema = Schema.Struct({ userId: requiredId });

export type AdminUserInput = typeof adminUserInputSchema.Encoded;
export type AdminAccountsResponse = typeof adminAccountsResponseSchema.Type;
export type AdminUserResponse = typeof adminUserResponseSchema.Type;
