import { isNotFound, isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { createAdminRpcClient, sendAdminRpc } from "./admin-rpc";
import type { ApiFetcher } from "./admin-rpc";

const productOrigin = "http://127.0.0.1:3001";

const respondWith = (status: number) => {
  const requests: Request[] = [];
  const api: ApiFetcher = {
    fetch: async (request) => {
      requests.push(request);
      return await Promise.resolve(Response.json({ json: {} }, { status }));
    },
  };
  return { api, requests };
};

const rpcRequest = () =>
  new Request(`${productOrigin}/api/rpc/admin/accounts`, { method: "POST" });

describe(sendAdminRpc, () => {
  it("returns successful API responses", async () => {
    const { api } = respondWith(200);
    const response = await sendAdminRpc(
      { api, adminBase: "/", productOrigin },
      rpcRequest()
    );
    expect(response.status).toBe(200);
  });

  it("does not follow API redirects", async () => {
    const { api, requests } = respondWith(200);
    await sendAdminRpc({ api, adminBase: "/", productOrigin }, rpcRequest());
    expect(requests[0]?.redirect).toBe("manual");
  });

  it("redirects signed-out requests to product sign-in with the admin return path", async () => {
    const { api } = respondWith(401);
    await expect(
      sendAdminRpc({ api, adminBase: "/admin/", productOrigin }, rpcRequest())
    ).rejects.toSatisfy(
      (error) =>
        isRedirect(error) &&
        error.options.href === `${productOrigin}/auth?next=%2Fadmin` &&
        error.options.reloadDocument === true
    );
  });

  it.each([403, 404])(
    "hides the app with a not-found for %i",
    async (status) => {
      const { api } = respondWith(status);
      await expect(
        sendAdminRpc({ api, adminBase: "/", productOrigin }, rpcRequest())
      ).rejects.toSatisfy(isNotFound);
    }
  );

  it("fails other API errors", async () => {
    const { api } = respondWith(500);
    await expect(
      sendAdminRpc({ api, adminBase: "/", productOrigin }, rpcRequest())
    ).rejects.toThrow("API request failed with status 500");
  });
});

describe(createAdminRpcClient, () => {
  it("forwards only the session cookie to the product RPC endpoint", async () => {
    const { api, requests } = respondWith(200);
    const client = createAdminRpcClient({
      api,
      adminBase: "/",
      cookie: "better-auth.session_token=abc",
      productOrigin,
    });
    await client.admin.accounts({});
    const [request] = requests;
    expect(request?.url).toBe(`${productOrigin}/api/rpc/admin/accounts`);
    expect(request?.headers.get("cookie")).toBe(
      "better-auth.session_token=abc"
    );
  });

  it("sends no cookie header when the request has none", async () => {
    const { api, requests } = respondWith(200);
    const client = createAdminRpcClient({
      api,
      adminBase: "/",
      cookie: undefined,
      productOrigin,
    });
    await client.admin.accounts({});
    expect(requests[0]?.headers.get("cookie")).toBeNull();
  });
});
