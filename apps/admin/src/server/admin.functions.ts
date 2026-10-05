import { createDatabase } from "@pcobooster/api/db/client";
import {
  getAccountActivity,
  getUserAccountDetail,
} from "@pcobooster/api/modules/admin/get-account-activity";
import type {
  AdminAccountsResponse,
  AdminUserResponse,
} from "@pcobooster/contracts/admin";
import { adminUserInputSchema } from "@pcobooster/contracts/admin";
import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { Schema } from "effect";

import { verifiedAccessEmail } from "@/server/access-identity";

/**
 * The admin Worker reads the product's D1 database through its own binding; the public API has
 * no admin procedures. Cloudflare Access decides who reaches this Worker (`alchemy.run.ts`), and
 * every read also requires the Access login itself: deployed stages set `ACCESS_TEAM_DOMAIN`, and
 * a request without a valid login from that team gets the not-found page, never data. Local
 * development has no Access and sets no team domain.
 */
const requireViewer = async (): Promise<string | null> => {
  if (env.ACCESS_TEAM_DOMAIN === "") {
    return null;
  }
  const email = await verifiedAccessEmail(
    {
      assertion: getRequestHeader("cf-access-jwt-assertion"),
      cookie: getRequestHeader("cookie"),
    },
    env.ACCESS_TEAM_DOMAIN
  );
  if (email === null) {
    notFound({ throw: true });
  }
  return email;
};

const database = () => createDatabase(env.DB);

export const getAdminAccounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminAccountsResponse> => {
    const email = await requireViewer();
    return { email, accounts: await getAccountActivity(database()) };
  }
);

export const getAdminUser = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(adminUserInputSchema))
  .handler(async ({ data }): Promise<AdminUserResponse> => {
    await requireViewer();
    return { user: await getUserAccountDetail(data.userId, database()) };
  });
