import { auth } from "@/lib/auth";
import { getPlanningCenterIdentityFromAccessToken } from "@/lib/auth/planning-center-identity";
import type { PlanningCenterIdentity } from "@/lib/auth/planning-center-identity";

export const getPlanningCenterIdentityForAccount = async (
  request: Request,
  accountId: string
): Promise<PlanningCenterIdentity | null> => {
  try {
    const token = await auth.api.getAccessToken({
      headers: request.headers,
      body: { providerId: "planning-center", accountId },
    });
    return await getPlanningCenterIdentityFromAccessToken(token.accessToken);
  } catch {
    return null;
  }
};
