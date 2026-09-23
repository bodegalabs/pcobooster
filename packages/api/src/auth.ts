import { getPlanningCenterIdentityFromAccessToken } from "@pcobooster/api/auth/planning-center-identity";
import { db } from "@pcobooster/api/db";
import {
  getActivityRequestContext,
  recordActivityEvent,
} from "@pcobooster/api/db/activity-events";
import * as schema from "@pcobooster/api/db/schema";
import { logger } from "@pcobooster/api/logger";
import { upsertPlanningCenterAccountIdentity } from "@pcobooster/api/modules/admin/planning-center-account-identities";
import type { PostHogPersonProperties } from "@pcobooster/api/modules/analytics/posthog-activity";
import { getPostHogPersonProperties } from "@pcobooster/api/modules/analytics/posthog-person";
import type { JsonObject } from "@pcobooster/planning-center-models/json";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins/generic-oauth";

const baseUrl = process.env.BETTER_AUTH_URL;
const secret = process.env.BETTER_AUTH_SECRET;
const configuredWebOrigin = process.env.CORS_ORIGIN;

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

/**
 * Parent domain for the session cookie (for example `pcobooster.com`) so the
 * private admin app on its own subdomain receives the same session.
 */
const sessionCookieDomain = process.env.AUTH_COOKIE_DOMAIN;

const trustedOrigins = [
  ...(configuredWebOrigin !== undefined && configuredWebOrigin !== ""
    ? [configuredWebOrigin]
    : []),
  ...(process.env.NODE_ENV === "production"
    ? []
    : ["http://localhost:3001", "http://127.0.0.1:3001"]),
];

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
    person?: PostHogPersonProperties | null;
    context: Parameters<typeof getActivityRequestContext>[0];
  }
) => {
  try {
    const requestContext = getActivityRequestContext(payload.context);
    await recordActivityEvent(
      {
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
      },
      payload.person ?? null
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    authEventLog.warn(
      { err, eventType },
      "Failed to record auth activity event"
    );
  }
};

const getPostHogPersonSafely = async (
  userId: string
): Promise<PostHogPersonProperties | null> => {
  try {
    return await getPostHogPersonProperties(userId);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    authEventLog.warn({ err }, "Failed to load PostHog person properties");
    return null;
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
  trustedOrigins,
  advanced: {
    crossSubDomainCookies: {
      enabled: sessionCookieDomain !== undefined && sessionCookieDomain !== "",
      domain: sessionCookieDomain,
    },
  },
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
            person: await getPostHogPersonSafely(session.userId),
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
    genericOAuth({
      config: [
        {
          providerId: "planning-center",
          discoveryUrl:
            "https://api.planningcenteronline.com/.well-known/openid-configuration",
          // Discovery runs once per server instance. Pinned endpoints keep the
          // provider registered when that fetch fails, instead of every
          // sign-in on the instance returning PROVIDER_NOT_FOUND.
          authorizationUrl:
            "https://api.planningcenteronline.com/oauth/authorize",
          tokenUrl: "https://api.planningcenteronline.com/oauth/token",
          userInfoUrl: "https://api.planningcenteronline.com/oauth/userinfo",
          clientId: planningCenterClientId,
          clientSecret: planningCenterClientSecret,
          scopes: ["openid", "services", "people"],
          // Force Planning Center to prompt for login so users can switch accounts/org context.
          prompt: "login",
          pkce: true,
          accessType: "offline",
          tokenEndpointAuth: { method: "client_secret_basic" },
          overrideUserInfo: true,
        },
      ],
    }),
  ],
});
