import { getPlanningCenterToken } from "@pcobooster/api/auth/planning-center-token";
import type {
  StoredPlanningCenterAccount,
  TokenApi,
} from "@pcobooster/api/auth/planning-center-token";
import { describe, expect, it } from "vitest";

const NOW = Date.parse("2026-10-13T16:00:00Z");
const HOUR_MS = 3_600_000;

const storedAccount = (
  overrides: Partial<StoredPlanningCenterAccount> = {}
): StoredPlanningCenterAccount => ({
  id: "local-row-id",
  accountId: "provider-account-id",
  providerId: "planning-center",
  userId: "user-1",
  createdAt: "2026-09-01T00:00:00Z",
  accessToken: "stored-token",
  accessTokenExpiresAt: new Date(NOW + HOUR_MS),
  scope: "openid,services,people",
  ...overrides,
});

/** Better Auth's account store and token endpoint, as Planning Center's refresh leaves them. */
const fakeTokenApi = (options: {
  readonly refresh: TokenApi["refresh"];
  readonly stored?: () => readonly StoredPlanningCenterAccount[];
}) => {
  const refreshes: string[] = [];
  const waits: number[] = [];
  const api: TokenApi = {
    sleep: async (ms) => {
      waits.push(ms);
      await Promise.resolve();
    },
    findAccounts: async () => await Promise.resolve(options.stored?.() ?? []),
    refresh: async (userId, accountRowId) => {
      refreshes.push(`${userId}/${accountRowId}`);
      return await options.refresh(userId, accountRowId);
    },
  };
  return { api, refreshes, waits };
};

describe("Planning Center tokens", () => {
  it("uses a stored token that is still valid without asking Better Auth", async () => {
    const { api, refreshes } = fakeTokenApi({
      refresh: async () => await Promise.reject(new Error("not expected")),
    });

    const token = await getPlanningCenterToken(storedAccount(), api, NOW);

    expect([token, refreshes]).toStrictEqual([
      { accessToken: "stored-token", scopes: ["openid", "services", "people"] },
      [],
    ]);
  });

  it("refreshes an expiring token through Better Auth", async () => {
    const { api, refreshes } = fakeTokenApi({
      refresh: async () =>
        await Promise.resolve({
          accessToken: "refreshed-token",
          scopes: ["services"],
        }),
    });

    const token = await getPlanningCenterToken(
      storedAccount({ accessTokenExpiresAt: new Date(NOW + 1000) }),
      api,
      NOW
    );

    expect([token, refreshes]).toStrictEqual([
      { accessToken: "refreshed-token", scopes: ["services"] },
      ["user-1/local-row-id"],
    ]);
  });

  it("waits for the token a parallel request is storing when its own refresh is refused", async () => {
    const expiredAccount = storedAccount({
      accessTokenExpiresAt: new Date(NOW - HOUR_MS),
    });
    let reads = 0;
    const { api, waits } = fakeTokenApi({
      refresh: async () =>
        await Promise.reject(new Error("invalid_grant: refresh token revoked")),
      stored: () => {
        reads += 1;
        // The winning request stores its token between the second and third reads.
        return reads < 3
          ? [expiredAccount]
          : [
              storedAccount({
                accessToken: "token-from-parallel-request",
                accessTokenExpiresAt: new Date(Date.now() + 2 * HOUR_MS),
              }),
            ];
      },
    });

    const token = await getPlanningCenterToken(expiredAccount, api, NOW);

    expect([token.accessToken, waits]).toStrictEqual([
      "token-from-parallel-request",
      [0, 500, 1500],
    ]);
  });

  it("uses the token another isolate stored when its own refresh is refused", async () => {
    const { api } = fakeTokenApi({
      refresh: async () =>
        await Promise.reject(new Error("invalid_grant: refresh token revoked")),
      stored: () => [
        storedAccount({
          accessToken: "token-from-another-isolate",
          accessTokenExpiresAt: new Date(Date.now() + 2 * HOUR_MS),
        }),
      ],
    });

    const token = await getPlanningCenterToken(
      storedAccount({ accessTokenExpiresAt: new Date(NOW - HOUR_MS) }),
      api,
      NOW
    );

    expect(token.accessToken).toBe("token-from-another-isolate");
  });

  it("asks the user to sign in again when the refresh fails and nothing newer is stored", async () => {
    const expiredAccount = storedAccount({
      accessTokenExpiresAt: new Date(NOW - HOUR_MS),
    });
    const { api } = fakeTokenApi({
      refresh: async () => await Promise.reject(new Error("invalid_grant")),
      stored: () => [expiredAccount],
    });

    await expect(
      getPlanningCenterToken(expiredAccount, api, NOW)
    ).rejects.toMatchObject({
      _tag: "Unauthenticated",
      message: "Planning Center connection expired. Please sign in again.",
    });
  });

  it("never returns an empty OAuth token that could fall back to application credentials", async () => {
    const { api } = fakeTokenApi({
      refresh: async () =>
        await Promise.resolve({ accessToken: "", scopes: [] }),
    });

    await expect(
      getPlanningCenterToken(storedAccount({ accessToken: "" }), api, NOW)
    ).rejects.toMatchObject({ _tag: "Unauthenticated" });
  });
});
