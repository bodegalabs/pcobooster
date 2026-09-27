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
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";

import { accessViewerEmail } from "@/server/access-viewer";

/**
 * The admin Worker reads the product's D1 database through its own binding. Cloudflare Access
 * decides who reaches this Worker (`alchemy.run.ts`); the public API has no admin procedures.
 */
const database = () => createDatabase(env.DB);

export const getAdminAccounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminAccountsResponse> => ({
    email: accessViewerEmail({
      email: getRequestHeader("cf-access-authenticated-user-email"),
      jwt: getRequestHeader("cf-access-jwt-assertion"),
    }),
    accounts: await getAccountActivity(database()),
  })
);

export const getAdminUser = createServerFn({ method: "GET" })
  .validator(adminUserInputSchema)
  .handler(async ({ data }): Promise<AdminUserResponse> => ({
    user: await getUserAccountDetail(data.userId, database()),
  }));
