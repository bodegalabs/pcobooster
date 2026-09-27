import { adminUserInputSchema } from "@pcobooster/contracts/admin";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";

import { createAdminRpcClient } from "@/server/admin-rpc";

/**
 * The product app owns sign-in and the API. In production its session cookie is scoped
 * to the parent domain, so this subdomain forwards it unchanged.
 */
const adminRpcClient = () =>
  createAdminRpcClient({
    api: env.API,
    adminBase: import.meta.env.BASE_URL,
    cookie: getRequestHeader("cookie"),
    productOrigin: env.PRODUCT_ORIGIN,
  });

export const getAdminAccounts = createServerFn({ method: "GET" }).handler(
  async () => await adminRpcClient().admin.accounts({})
);

export const getAdminUser = createServerFn({ method: "GET" })
  .validator(adminUserInputSchema)
  .handler(
    async ({ data }) =>
      await adminRpcClient().admin.user({ userId: data.userId })
  );
