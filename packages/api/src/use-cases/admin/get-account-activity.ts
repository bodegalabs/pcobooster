import type {
  AdminAccountActivity,
  AdminUserAccountDetail,
} from "@worship-admin/api/admin-contracts";
import { getPlanningCenterIdentityFromAccessToken } from "@worship-admin/api/auth/planning-center-identity";
import { db } from "@worship-admin/api/db";
import { isNonEmptyString } from "@worship-admin/api/json";
import { getPlanningCenterAccountIdentity } from "@worship-admin/api/use-cases/admin/planning-center-account-identities";
import { sql } from "drizzle-orm";
import { z } from "zod";

const databaseDateSchema = z.union([z.date(), z.string()]);
const databaseCountSchema = z.union([z.number(), z.string()]);
const accountActivityRowSchema = z.object({
  user_id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  created_at: databaseDateSchema,
  updated_at: databaseDateSchema,
  linked_accounts: databaseCountSchema,
  providers: z.array(z.string()).nullable(),
  active_sessions: databaseCountSchema,
  login_events: databaseCountSchema,
  login_events_7d: databaseCountSchema,
  login_events_30d: databaseCountSchema,
  sign_out_events: databaseCountSchema,
  activity_events: databaseCountSchema,
  first_login_at: databaseDateSchema.nullable(),
  last_login_at: databaseDateSchema.nullable(),
  last_activity_at: databaseDateSchema.nullable(),
});
const linkedAccountRowSchema = z.object({
  id: z.string(),
  provider_account_id: z.string(),
  provider_id: z.string(),
  created_at: databaseDateSchema,
  updated_at: databaseDateSchema,
  scope: z.string().nullable(),
  access_token_expires_at: databaseDateSchema.nullable(),
  refresh_token_expires_at: databaseDateSchema.nullable(),
  access_token: z.string().nullable(),
  activity_events: databaseCountSchema,
  linked_events: databaseCountSchema,
  first_activity_at: databaseDateSchema.nullable(),
  last_activity_at: databaseDateSchema.nullable(),
});

const toNumber = Number;

const toIsoString = (value: Date | string | null): string | null => {
  if (value === null) {
    return null;
  }
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
};

export const getAdminEmailAllowlist = (): string[] => {
  const configured = process.env.WORSHIP_ADMIN_ADMIN_EMAILS;
  if (!isNonEmptyString(configured)) {
    return ["jakebodea@gmail.com"];
  }

  return configured
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
};

export const isAdminEmail = (email: string | null | undefined): boolean => {
  if (!isNonEmptyString(email)) {
    return false;
  }
  return getAdminEmailAllowlist().includes(email.toLowerCase());
};

export const getAccountActivity = async (): Promise<AdminAccountActivity[]> => {
  const { rows } = await db.execute(sql`
    with linked_accounts as (
      select
        "userId" as user_id,
        count(*)::int as linked_accounts,
        array_agg(distinct "providerId" order by "providerId") as providers
      from account
      group by "userId"
    ),
    active_sessions as (
      select
        "userId" as user_id,
        count(*)::int as active_sessions
      from session
      where "expiresAt" > now()
      group by "userId"
    ),
    activity as (
      select
        actor_user_id as user_id,
        count(*)::int as activity_events,
        count(*) filter (where event_type = 'auth_session_created')::int as login_events,
        count(*) filter (
          where event_type = 'auth_session_created'
            and created_at >= now() - interval '7 days'
        )::int as login_events_7d,
        count(*) filter (
          where event_type = 'auth_session_created'
            and created_at >= now() - interval '30 days'
        )::int as login_events_30d,
        count(*) filter (where event_type = 'auth_session_deleted')::int as sign_out_events,
        min(created_at) filter (where event_type = 'auth_session_created') as first_login_at,
        max(created_at) filter (where event_type = 'auth_session_created') as last_login_at,
        max(created_at) as last_activity_at
      from activity_events
      where actor_user_id is not null
      group by actor_user_id
    )
    select
      u.id as user_id,
      u.name,
      u.email,
      u.image,
      u."createdAt" as created_at,
      u."updatedAt" as updated_at,
      coalesce(la.linked_accounts, 0) as linked_accounts,
      coalesce(la.providers, array[]::text[]) as providers,
      coalesce(s.active_sessions, 0) as active_sessions,
      coalesce(a.login_events, 0) as login_events,
      coalesce(a.login_events_7d, 0) as login_events_7d,
      coalesce(a.login_events_30d, 0) as login_events_30d,
      coalesce(a.sign_out_events, 0) as sign_out_events,
      coalesce(a.activity_events, 0) as activity_events,
      a.first_login_at,
      a.last_login_at,
      a.last_activity_at
    from "user" u
    left join linked_accounts la on la.user_id = u.id
    left join active_sessions s on s.user_id = u.id
    left join activity a on a.user_id = u.id
    order by a.last_login_at desc nulls last, u."createdAt" desc;
  `);

  return accountActivityRowSchema
    .array()
    .parse(rows)
    .map((row) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      image: row.image,
      createdAt: toIsoString(row.created_at) ?? "",
      updatedAt: toIsoString(row.updated_at) ?? "",
      linkedAccounts: toNumber(row.linked_accounts),
      providers: row.providers ?? [],
      activeSessions: toNumber(row.active_sessions),
      loginEvents: toNumber(row.login_events),
      loginEvents7d: toNumber(row.login_events_7d),
      loginEvents30d: toNumber(row.login_events_30d),
      signOutEvents: toNumber(row.sign_out_events),
      activityEvents: toNumber(row.activity_events),
      firstLoginAt: toIsoString(row.first_login_at),
      lastLoginAt: toIsoString(row.last_login_at),
      lastActivityAt: toIsoString(row.last_activity_at),
    }));
};

export const getUserAccountDetail = async (
  userId: string
): Promise<AdminUserAccountDetail | null> => {
  const accounts = await getAccountActivity();
  const user = accounts.find((account) => account.userId === userId);
  if (!user) {
    return null;
  }

  const { rows } = await db.execute(
    sql`
      select
        a.id,
        a."accountId" as provider_account_id,
        a."providerId" as provider_id,
        a."createdAt" as created_at,
        a."updatedAt" as updated_at,
        a.scope,
        a."accessTokenExpiresAt" as access_token_expires_at,
        a."refreshTokenExpiresAt" as refresh_token_expires_at,
        a."accessToken" as access_token,
        count(e.id)::int as activity_events,
        count(e.id) filter (where e.event_type = 'auth_account_linked')::int as linked_events,
        min(e.created_at) as first_activity_at,
        max(e.created_at) as last_activity_at
      from account a
      left join activity_events e on e.actor_account_id = a.id
      where a."userId" = ${userId}
      group by
        a.id,
        a."accountId",
        a."providerId",
        a."createdAt",
        a."updatedAt",
        a.scope,
        a."accessTokenExpiresAt",
        a."refreshTokenExpiresAt"
      order by a."updatedAt" desc;
    `
  );

  const linkedAccountDetails = await Promise.all(
    linkedAccountRowSchema
      .array()
      .parse(rows)
      .map(async (row) => {
        const storedIdentity = await getPlanningCenterAccountIdentity(row.id);
        return {
          id: row.id,
          providerAccountId: row.provider_account_id,
          providerId: row.provider_id,
          createdAt: toIsoString(row.created_at) ?? "",
          updatedAt: toIsoString(row.updated_at) ?? "",
          scope: row.scope,
          accessTokenExpiresAt: toIsoString(row.access_token_expires_at),
          refreshTokenExpiresAt: toIsoString(row.refresh_token_expires_at),
          activityEvents: toNumber(row.activity_events),
          linkedEvents: toNumber(row.linked_events),
          firstActivityAt: toIsoString(row.first_activity_at),
          lastActivityAt: toIsoString(row.last_activity_at),
          identity:
            storedIdentity ??
            (await getPlanningCenterIdentityFromAccessToken(row.access_token)),
        };
      })
  );

  return {
    ...user,
    linkedAccountDetails,
  };
};
