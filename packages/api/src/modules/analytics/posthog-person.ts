import { db } from "@pcobooster/api/db";
import {
  account,
  planningCenterAccountIdentities,
  user,
} from "@pcobooster/api/db/schema";
import type { PostHogPersonProperties } from "@pcobooster/api/modules/analytics/posthog-activity";
import { desc, eq } from "drizzle-orm";

/** The most recently refreshed Planning Center identity names the user's church. */
export const getPostHogPersonProperties = async (
  userId: string
): Promise<PostHogPersonProperties | null> => {
  const [row] = await db
    .select({
      email: user.email,
      name: user.name,
      organizationId: planningCenterAccountIdentities.organizationId,
      organizationName: planningCenterAccountIdentities.organizationName,
    })
    .from(user)
    .leftJoin(account, eq(account.userId, user.id))
    .leftJoin(
      planningCenterAccountIdentities,
      eq(planningCenterAccountIdentities.accountId, account.id)
    )
    .where(eq(user.id, userId))
    .orderBy(desc(planningCenterAccountIdentities.updatedAt))
    .limit(1);
  return row ?? null;
};
