import { eq } from "drizzle-orm";
import { z } from "zod";

import { planningCenterIdentitySchema } from "@/lib/auth/planning-center-identity";
import type { PlanningCenterIdentity } from "@/lib/auth/planning-center-identity";
import { db } from "@/lib/db";
import {
  account,
  planningCenterAccountIdentities,
  user,
} from "@/lib/db/schema";

const clientId = process.env.PLANNING_CENTER_OAUTH_CLIENT_ID;
const clientSecret = process.env.PLANNING_CENTER_OAUTH_CLIENT_SECRET;

if (!(clientId !== undefined && clientId !== "")) {
  throw new Error("Missing PLANNING_CENTER_OAUTH_CLIENT_ID");
}
if (!(clientSecret !== undefined && clientSecret !== "")) {
  throw new Error("Missing PLANNING_CENTER_OAUTH_CLIENT_SECRET");
}

const tokenEndpoint = "https://api.planningcenteronline.com/oauth/token";
const userinfoEndpoint = "https://api.planningcenteronline.com/oauth/userinfo";

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
});
type TokenResponse = z.infer<typeof tokenResponseSchema>;

const refreshAccessToken = async (
  refreshToken: string
): Promise<TokenResponse> => {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(
      `refresh failed: ${response.status} ${await response.text()}`
    );
  }

  return tokenResponseSchema.parse(await response.json());
};

const fetchIdentity = async (
  accessToken: string
): Promise<PlanningCenterIdentity | null> => {
  const response = await fetch(userinfoEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `userinfo failed: ${response.status} ${await response.text()}`
    );
  }

  const parsed = planningCenterIdentitySchema.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
};

const main = async () => {
  const accounts = await db
    .select({
      id: account.id,
      accountId: account.accountId,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      accessTokenExpiresAt: account.accessTokenExpiresAt,
      userEmail: user.email,
    })
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .where(eq(account.providerId, "planning-center"))
    .orderBy(user.email, account.updatedAt);

  const backfillAccount = async (
    row: (typeof accounts)[number]
  ): Promise<void> => {
    try {
      let { accessToken } = row;
      if (
        !(accessToken !== null && accessToken !== "") ||
        !row.accessTokenExpiresAt ||
        row.accessTokenExpiresAt <= new Date()
      ) {
        if (!(row.refreshToken !== null && row.refreshToken !== "")) {
          throw new Error("no refresh token");
        }
        const refreshed = await refreshAccessToken(row.refreshToken);
        accessToken = refreshed.access_token;
        await db
          .update(account)
          .set({
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token ?? row.refreshToken,
            accessTokenExpiresAt:
              refreshed.expires_in === undefined
                ? row.accessTokenExpiresAt
                : new Date(Date.now() + refreshed.expires_in * 1000),
            updatedAt: new Date(),
          })
          .where(eq(account.id, row.id));
      }

      const identity = await fetchIdentity(accessToken);
      if (!identity) {
        throw new Error("empty identity");
      }
      const now = new Date();

      await db
        .insert(planningCenterAccountIdentities)
        .values({
          accountId: row.id,
          providerAccountId: row.accountId,
          planningCenterUserId: identity.sub,
          name: identity.name,
          email: identity.email,
          organizationId: identity.organizationId,
          organizationName: identity.organizationName,
          fetchedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: planningCenterAccountIdentities.accountId,
          set: {
            providerAccountId: row.accountId,
            planningCenterUserId: identity.sub,
            name: identity.name,
            email: identity.email,
            organizationId: identity.organizationId,
            organizationName: identity.organizationName,
            fetchedAt: now,
            updatedAt: now,
          },
        });

      console.log(
        `${row.userEmail} ${row.accountId}: ${identity.organizationName ?? "unknown"} (${identity.organizationId ?? "no org id"})`
      );
    } catch (error) {
      console.warn(
        `${row.userEmail} ${row.accountId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
  const remainingAccounts = accounts.values();
  const processNextAccount = async (): Promise<void> => {
    const next = remainingAccounts.next();
    if (next.done === true) {
      return;
    }
    await backfillAccount(next.value);
    await processNextAccount();
  };
  await processNextAccount();
};

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
