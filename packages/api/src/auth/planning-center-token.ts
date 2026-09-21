import { auth } from "@worship-admin/api/auth";
import { ApiError } from "@worship-admin/api/http/api-error";
import { isNonEmptyString } from "@worship-admin/api/json";

interface PlanningCenterAccountSelector {
  id: string;
  accountId: string;
}

interface TokenApi {
  getAccessToken: (
    headers: Headers,
    accountId: string
  ) => Promise<{ accessToken: string; scopes: string[] }>;
  refreshToken: (
    headers: Headers,
    accountId: string
  ) => Promise<{ accessToken?: string; scope?: string | null }>;
}

const authTokenApi: TokenApi = {
  getAccessToken: async (headers, accountId) =>
    await auth.api.getAccessToken({
      headers,
      body: { accountId },
    }),
  refreshToken: async (headers, accountId) =>
    await auth.api.refreshToken({
      headers,
      body: { accountId },
    }),
};

export const getPlanningCenterToken = async (
  headers: Headers,
  account: PlanningCenterAccountSelector,
  tokenApi: TokenApi = authTokenApi
): Promise<{ accessToken: string; scopes: string[] }> => {
  // Better Auth 1.7 selects tokens by the local account row ID.
  const localAccountId = account.id;
  try {
    const token = await tokenApi.getAccessToken(headers, localAccountId);
    return { accessToken: token.accessToken, scopes: token.scopes };
  } catch {
    const refreshed = await tokenApi.refreshToken(headers, localAccountId);
    if (!isNonEmptyString(refreshed.accessToken)) {
      throw new ApiError(
        401,
        "PLANNING_CENTER_REAUTH_REQUIRED",
        "Planning Center connection expired. Please sign in again."
      );
    }
    return {
      accessToken: refreshed.accessToken,
      scopes: isNonEmptyString(refreshed.scope)
        ? refreshed.scope.split(/\s+/u).filter(Boolean)
        : [],
    };
  }
};
