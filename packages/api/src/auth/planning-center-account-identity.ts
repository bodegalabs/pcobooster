import type { Auth } from "@pcobooster/api/auth";
import { getPlanningCenterIdentityFromAccessToken } from "@pcobooster/api/auth/planning-center-identity";
import type { PlanningCenterIdentity } from "@pcobooster/api/auth/planning-center-identity";
import {
  createAuthTokenApi,
  getPlanningCenterToken,
} from "@pcobooster/api/auth/planning-center-token";

export const getPlanningCenterIdentityForAccount = async (
  auth: Auth,
  request: Request,
  account: { id: string; accountId: string }
): Promise<PlanningCenterIdentity | null> => {
  try {
    const token = await getPlanningCenterToken(
      request.headers,
      account,
      createAuthTokenApi(auth)
    );
    return await getPlanningCenterIdentityFromAccessToken(token.accessToken);
  } catch {
    return null;
  }
};
