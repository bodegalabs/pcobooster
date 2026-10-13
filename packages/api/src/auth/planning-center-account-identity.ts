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
    const session = await auth.api.getSession({ headers: request.headers });
    if (session === null) {
      return null;
    }
    const tokenApi = createAuthTokenApi(auth);
    const accounts = await tokenApi.findAccounts(session.user.id);
    const stored = accounts.find((candidate) => candidate.id === account.id);
    if (stored === undefined) {
      return null;
    }
    const token = await getPlanningCenterToken(stored, tokenApi);
    return await getPlanningCenterIdentityFromAccessToken(token.accessToken);
  } catch {
    return null;
  }
};
