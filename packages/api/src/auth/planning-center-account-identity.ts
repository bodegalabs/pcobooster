import { getPlanningCenterIdentityFromAccessToken } from "@pcobooster/api/auth/planning-center-identity";
import type { PlanningCenterIdentity } from "@pcobooster/api/auth/planning-center-identity";
import { getPlanningCenterToken } from "@pcobooster/api/auth/planning-center-token";

export const getPlanningCenterIdentityForAccount = async (
  request: Request,
  account: { id: string; accountId: string }
): Promise<PlanningCenterIdentity | null> => {
  try {
    const token = await getPlanningCenterToken(request.headers, account);
    return await getPlanningCenterIdentityFromAccessToken(token.accessToken);
  } catch {
    return null;
  }
};
