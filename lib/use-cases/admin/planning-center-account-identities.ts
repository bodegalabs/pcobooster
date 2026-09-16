import { eq } from "drizzle-orm";

import type { PlanningCenterIdentity } from "@/lib/auth/planning-center-identity";
import { db } from "@/lib/db";
import { planningCenterAccountIdentities } from "@/lib/db/schema";

export type StoredPlanningCenterAccountIdentity = PlanningCenterIdentity & {
  accountId: string;
  providerAccountId: string;
  fetchedAt: string;
};

export const upsertPlanningCenterAccountIdentity = async (input: {
  accountId: string;
  providerAccountId: string;
  identity: PlanningCenterIdentity;
  fetchedAt?: Date;
}) => {
  const now = new Date();
  const fetchedAt = input.fetchedAt ?? now;

  await db
    .insert(planningCenterAccountIdentities)
    .values({
      accountId: input.accountId,
      providerAccountId: input.providerAccountId,
      planningCenterUserId: input.identity.sub,
      name: input.identity.name,
      email: input.identity.email,
      organizationId: input.identity.organizationId,
      organizationName: input.identity.organizationName,
      fetchedAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: planningCenterAccountIdentities.accountId,
      set: {
        providerAccountId: input.providerAccountId,
        planningCenterUserId: input.identity.sub,
        name: input.identity.name,
        email: input.identity.email,
        organizationId: input.identity.organizationId,
        organizationName: input.identity.organizationName,
        fetchedAt,
        updatedAt: now,
      },
    });
};

export const getPlanningCenterAccountIdentity = async (
  accountId: string
): Promise<StoredPlanningCenterAccountIdentity | null> => {
  const row = await db.query.planningCenterAccountIdentities.findFirst({
    where: eq(planningCenterAccountIdentities.accountId, accountId),
  });
  if (!row) {
    return null;
  }

  return {
    accountId: row.accountId,
    providerAccountId: row.providerAccountId,
    sub: row.planningCenterUserId,
    name: row.name,
    email: row.email,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    fetchedAt: row.fetchedAt.toISOString(),
  };
};
