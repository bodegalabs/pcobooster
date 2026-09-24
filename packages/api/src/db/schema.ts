import type { JsonObject } from "@pcobooster/planning-center-models/json";
import { desc, relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .default(sql`(cast((julianday('now') - 2440587.5) * 86400000 as integer))`)
    .notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .default(sql`(cast((julianday('now') - 2440587.5) * 86400000 as integer))`)
    .notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .default(
        sql`(cast((julianday('now') - 2440587.5) * 86400000 as integer))`
      )
      .notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)]
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: integer("accessTokenExpiresAt", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refreshTokenExpiresAt", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .default(
        sql`(cast((julianday('now') - 2440587.5) * 86400000 as integer))`
      )
      .notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)]
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .default(
        sql`(cast((julianday('now') - 2440587.5) * 86400000 as integer))`
      )
      .notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
      .default(
        sql`(cast((julianday('now') - 2440587.5) * 86400000 as integer))`
      )
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const activityEvents = sqliteTable(
  "activity_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(
        sql`(cast((julianday('now') - 2440587.5) * 86400000 as integer))`
      )
      .notNull(),
    eventType: text("event_type").notNull(),
    actorUserId: text("actor_user_id"),
    actorAccountId: text("actor_account_id"),
    requestId: text("request_id"),
    path: text("path"),
    method: text("method"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    success: integer("success", { mode: "boolean" }),
    statusCode: integer("status_code"),
    errorCode: text("error_code"),
    serviceTypeId: text("service_type_id"),
    personId: text("person_id"),
    planId: text("plan_id"),
    teamId: text("team_id"),
    positionId: text("position_id"),
    metadata: text("metadata", { mode: "json" })
      .$type<JsonObject>()
      .default({})
      .notNull(),
  },
  (table) => [
    index("activity_events_created_at_idx").on(desc(table.createdAt)),
    index("activity_events_type_created_at_idx").on(
      table.eventType,
      desc(table.createdAt)
    ),
    index("activity_events_actor_user_created_at_idx").on(
      table.actorUserId,
      desc(table.createdAt)
    ),
  ]
);

/** Messages users send from the in-app feedback button. */
export const feedback = sqliteTable(
  "feedback",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(
        sql`(cast((julianday('now') - 2440587.5) * 86400000 as integer))`
      )
      .notNull(),
    userId: text("user_id").notNull(),
    message: text("message").notNull(),
    path: text("path").notNull(),
    postHogSessionId: text("posthog_session_id"),
    userAgent: text("user_agent"),
  },
  (table) => [index("feedback_created_at_idx").on(desc(table.createdAt))]
);

export const planningCenterAccountIdentities = sqliteTable(
  "planning_center_account_identities",
  {
    accountId: text("account_id")
      .primaryKey()
      .references(() => account.id, { onDelete: "cascade" }),
    providerAccountId: text("provider_account_id").notNull(),
    planningCenterUserId: text("planning_center_user_id"),
    name: text("name"),
    email: text("email"),
    organizationId: text("organization_id"),
    organizationName: text("organization_name"),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" })
      .default(
        sql`(cast((julianday('now') - 2440587.5) * 86400000 as integer))`
      )
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(
        sql`(cast((julianday('now') - 2440587.5) * 86400000 as integer))`
      )
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(
        sql`(cast((julianday('now') - 2440587.5) * 86400000 as integer))`
      )
      .notNull(),
  },
  (table) => [
    index("planning_center_account_identities_org_idx").on(
      table.organizationId
    ),
  ]
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  activityEvents: many(activityEvents),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one, many }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
  planningCenterIdentity: one(planningCenterAccountIdentities, {
    fields: [account.id],
    references: [planningCenterAccountIdentities.accountId],
  }),
  activityEvents: many(activityEvents),
}));

export const activityEventsRelations = relations(activityEvents, ({ one }) => ({
  actorUser: one(user, {
    fields: [activityEvents.actorUserId],
    references: [user.id],
  }),
  actorAccount: one(account, {
    fields: [activityEvents.actorAccountId],
    references: [account.id],
  }),
}));

export const planningCenterAccountIdentitiesRelations = relations(
  planningCenterAccountIdentities,
  ({ one }) => ({
    account: one(account, {
      fields: [planningCenterAccountIdentities.accountId],
      references: [account.id],
    }),
  })
);
