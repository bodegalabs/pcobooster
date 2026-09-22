import type { JsonObject } from "@pcobooster/planning-center-models/json";
import { relations, sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)]
);

export const account = pgTable(
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
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)]
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const activityEvents = pgTable(
  "activity_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    eventType: text("event_type").notNull(),
    actorUserId: text("actor_user_id"),
    actorAccountId: text("actor_account_id"),
    requestId: text("request_id"),
    path: text("path"),
    method: text("method"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    success: boolean("success"),
    statusCode: integer("status_code"),
    errorCode: text("error_code"),
    serviceTypeId: text("service_type_id"),
    personId: text("person_id"),
    planId: text("plan_id"),
    teamId: text("team_id"),
    positionId: text("position_id"),
    metadata: jsonb("metadata")
      .$type<JsonObject>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
  },
  (table) => [
    index("activity_events_created_at_idx").on(table.createdAt.desc()),
    index("activity_events_type_created_at_idx").on(
      table.eventType,
      table.createdAt.desc()
    ),
    index("activity_events_actor_user_created_at_idx").on(
      table.actorUserId,
      table.createdAt.desc()
    ),
  ]
);

export const planningCenterAccountIdentities = pgTable(
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
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
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
