import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins/generic-oauth";

import { getPlanningCenterIdentityFromAccessToken } from "@/lib/auth/planning-center-identity";
import { db } from "@/lib/db";
import {
  getActivityRequestContext,
  recordActivityEvent,
} from "@/lib/db/activity-events";
import * as schema from "@/lib/db/schema";
import type { JsonObject } from "@/lib/json";
import { logger } from "@/lib/logger";
import { upsertPlanningCenterAccountIdentity } from "@/lib/use-cases/admin/planning-center-account-identities";

const baseUrl = process.env.BETTER_AUTH_URL;
const secret = process.env.BETTER_AUTH_SECRET;

if (!(baseUrl !== undefined && baseUrl !== "")) {
  throw new Error("Missing BETTER_AUTH_URL environment variable");
}

if (!(secret !== undefined && secret !== "")) {
  throw new Error("Missing BETTER_AUTH_SECRET environment variable");
}

const planningCenterClientId = process.env.PLANNING_CENTER_OAUTH_CLIENT_ID;
const planningCenterClientSecret =
  process.env.PLANNING_CENTER_OAUTH_CLIENT_SECRET;

if (!(planningCenterClientId !== undefined && planningCenterClientId !== "")) {
  throw new Error(
    "Missing PLANNING_CENTER_OAUTH_CLIENT_ID environment variable"
  );
}

if (
  !(
    planningCenterClientSecret !== undefined &&
    planningCenterClientSecret !== ""
  )
) {
  throw new Error(
    "Missing PLANNING_CENTER_OAUTH_CLIENT_SECRET environment variable"
  );
}

const authEventLog = logger.for("auth/events");

const shouldTrackSessionDeletion = (
  context: Parameters<typeof getActivityRequestContext>[0]
): boolean => {
  const requestContext = getActivityRequestContext(context);
  if (!(requestContext.path !== null && requestContext.path !== "")) {
    return false;
  }

  return (
    requestContext.path.includes("/sign-out") ||
    requestContext.path.includes("/revoke-session") ||
    requestContext.path.includes("/revoke-sessions")
  );
};

const recordAuthEventSafely = async (
  eventType:
    | "auth_session_created"
    | "auth_session_deleted"
    | "auth_account_linked",
  payload: {
    userId?: string | null;
    accountId?: string | null;
    metadata?: JsonObject;
    context: Parameters<typeof getActivityRequestContext>[0];
  }
) => {
  try {
    const requestContext = getActivityRequestContext(payload.context);
    await recordActivityEvent({
      eventType,
      actorUserId: payload.userId ?? null,
      actorAccountId: payload.accountId ?? null,
      requestId: requestContext.requestId,
      path: requestContext.path,
      method: requestContext.method,
      ipAddress: requestContext.ipAddress,
      userAgent: requestContext.userAgent,
      success: true,
      statusCode: 200,
      metadata: payload.metadata ?? null,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    authEventLog.warn(
      { err, eventType },
      "Failed to record auth activity event"
    );
  }
};

const getPlanningCenterIdentitySafely = async (account: {
  id: string;
  accountId: string;
  accessToken?: string | null;
}) => {
  try {
    const identity = await getPlanningCenterIdentityFromAccessToken(
      account.accessToken
    );
    if (identity) {
      await upsertPlanningCenterAccountIdentity({
        accountId: account.id,
        providerAccountId: account.accountId,
        identity,
      });
    }
    return identity;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    authEventLog.warn(
      { err, accountId: account.id },
      "Failed to record Planning Center account identity"
    );
    return null;
  }
};

export const auth = betterAuth({
  baseURL: baseUrl,
  secret,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    camelCase: true,
    transaction: true,
  }),
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["planning-center"],
      updateUserInfoOnLink: true,
    },
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session, context) => {
          await recordAuthEventSafely("auth_session_created", {
            userId: session.userId,
            context,
          });
        },
      },
      delete: {
        after: async (session, context) => {
          if (!shouldTrackSessionDeletion(context)) {
            return;
          }

          await recordAuthEventSafely("auth_session_deleted", {
            userId: session.userId,
            metadata: {
              sessionId: session.id,
            },
            context,
          });
        },
      },
    },
    account: {
      create: {
        after: async (account, context) => {
          if (account.providerId !== "planning-center") {
            return;
          }

          const identity = await getPlanningCenterIdentitySafely(account);
          await recordAuthEventSafely("auth_account_linked", {
            userId: account.userId,
            accountId: account.id,
            metadata: {
              providerId: account.providerId,
              organizationId: identity?.organizationId ?? null,
              organizationName: identity?.organizationName ?? null,
              planningCenterUserId: identity?.sub ?? null,
            },
            context,
          });
        },
      },
    },
  },
  socialProviders: {},
  plugins: [
    nextCookies(),
    genericOAuth({
      config: [
        {
          providerId: "planning-center",
          discoveryUrl:
            "https://api.planningcenteronline.com/.well-known/openid-configuration",
          clientId: planningCenterClientId,
          clientSecret: planningCenterClientSecret,
          scopes: ["openid", "services", "people"],
          // Force Planning Center to prompt for login so users can switch accounts/org context.
          prompt: "login",
          pkce: true,
          accessType: "offline",
          authentication: "basic",
          overrideUserInfo: true,
        },
      ],
    }),
  ],
});
