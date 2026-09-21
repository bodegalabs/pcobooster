import { getPlanningCenterToken } from "@worship-admin/api/auth/planning-center-token";
import { describe, expect, it, vi } from "vitest";

describe("Planning Center token account selection", () => {
  it("never returns an empty OAuth token that could fall back to application credentials", async () => {
    const tokenApi = {
      getAccessToken: vi
        .fn<() => Promise<{ accessToken: string; scopes: string[] }>>()
        .mockResolvedValue({ accessToken: "", scopes: [] }),
      refreshToken: vi
        .fn<() => Promise<{ accessToken: string }>>()
        .mockResolvedValue({ accessToken: "" }),
    };
    await expect(
      getPlanningCenterToken(
        new Headers(),
        { id: "local-row-id", accountId: "provider-account-id" },
        tokenApi
      )
    ).rejects.toMatchObject({
      _tag: "Unauthenticated",
      message: "Planning Center connection expired. Please sign in again.",
    });
    expect(tokenApi.refreshToken).toHaveBeenCalledOnce();
  });

  it("uses the local account ID when the access token is valid", async () => {
    const headers = new Headers();
    const calls: string[] = [];
    const tokenApi = {
      getAccessToken: async (receivedHeaders: Headers, accountId: string) => {
        expect(receivedHeaders).toBe(headers);
        calls.push(`access:${accountId}`);
        return await Promise.resolve({
          accessToken: "valid-token",
          scopes: ["services"],
        });
      },
      refreshToken: async (_headers: Headers, accountId: string) => {
        calls.push(`refresh:${accountId}`);
        return await Promise.resolve({ accessToken: "unused" });
      },
    };

    const token = await getPlanningCenterToken(
      headers,
      { id: "local-row-id", accountId: "provider-account-id" },
      tokenApi
    );

    expect(calls).toStrictEqual(["access:local-row-id"]);
    expect(token).toStrictEqual({
      accessToken: "valid-token",
      scopes: ["services"],
    });
  });

  it("selects the local account for access and refresh requests", async () => {
    const headers = new Headers();
    const calls: string[] = [];
    const tokenApi = {
      getAccessToken: async (receivedHeaders: Headers, accountId: string) => {
        expect(receivedHeaders).toBe(headers);
        calls.push(`access:${accountId}`);
        return await Promise.reject(new Error("Token expired"));
      },
      refreshToken: async (receivedHeaders: Headers, accountId: string) => {
        expect(receivedHeaders).toBe(headers);
        calls.push(`refresh:${accountId}`);
        return await Promise.resolve({
          accessToken: "refreshed-token",
          scope: "services people",
        });
      },
    };

    const token = await getPlanningCenterToken(
      headers,
      { id: "local-row-id", accountId: "provider-account-id" },
      tokenApi
    );

    expect(calls).toStrictEqual([
      "access:local-row-id",
      "refresh:local-row-id",
    ]);
    expect(token).toStrictEqual({
      accessToken: "refreshed-token",
      scopes: ["services", "people"],
    });
  });
});
