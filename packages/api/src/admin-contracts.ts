import { z } from "zod";

export const adminAccountActivitySchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  linkedAccounts: z.number(),
  providers: z.array(z.string()),
  activeSessions: z.number(),
  loginEvents: z.number(),
  loginEvents7d: z.number(),
  loginEvents30d: z.number(),
  signOutEvents: z.number(),
  activityEvents: z.number(),
  firstLoginAt: z.string().nullable(),
  lastLoginAt: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
});

export type AdminAccountActivity = z.infer<typeof adminAccountActivitySchema>;

export const planningCenterIdentitySchema = z.object({
  sub: z.string().nullable(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  organizationId: z.string().nullable(),
  organizationName: z.string().nullable(),
});

export const adminLinkedAccountSchema = z.object({
  id: z.string(),
  providerAccountId: z.string(),
  providerId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  scope: z.string().nullable(),
  accessTokenExpiresAt: z.string().nullable(),
  refreshTokenExpiresAt: z.string().nullable(),
  activityEvents: z.number(),
  linkedEvents: z.number(),
  firstActivityAt: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
  identity: planningCenterIdentitySchema.nullable(),
});

export type AdminLinkedAccount = z.infer<typeof adminLinkedAccountSchema>;

export const adminUserAccountDetailSchema = adminAccountActivitySchema.extend({
  linkedAccountDetails: z.array(adminLinkedAccountSchema),
});

export type AdminUserAccountDetail = z.infer<
  typeof adminUserAccountDetailSchema
>;

export const adminAccountsResponseSchema = z.object({
  email: z.string(),
  accounts: z.array(adminAccountActivitySchema),
});

export const adminUserResponseSchema = z.object({
  user: adminUserAccountDetailSchema.nullable(),
});

export const sessionStatusSchema = z.object({ authenticated: z.boolean() });
