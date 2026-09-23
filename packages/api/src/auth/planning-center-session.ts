import { Unauthenticated } from "@pcobooster/api/application/errors/unauthenticated";
import { auth } from "@pcobooster/api/auth";
import {
  getDevBypassSession,
  isDevAuthBypassEnabled,
} from "@pcobooster/api/auth/dev-bypass";
import { getPlanningCenterToken } from "@pcobooster/api/auth/planning-center-token";
import { readCookie } from "@pcobooster/api/http/cookies";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";

const PLANNING_CENTER_PROVIDER_ID = "planning-center";
export const PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE =
  "pco-selected-account-id";

export const getSelectedPlanningCenterAccountId = (
  request: Request
): string | null =>
  readCookie(request, PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE);

export interface PlanningCenterUserAuthContext {
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
  accessToken: string;
  scopes: string[];
  accountId: string;
  account: { id: string; accountId: string };
}

export const requirePlanningCenterAccessToken = async (
  request: Request
): Promise<PlanningCenterUserAuthContext> => {
  if (isDevAuthBypassEnabled()) {
    return {
      session: getDevBypassSession(),
      accessToken: "",
      scopes: [],
      accountId: "dev-bypass-account",
      account: { id: "dev-bypass-account", accountId: "dev-bypass-account" },
    };
  }

  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    throw new Unauthenticated({
      message: "Sign in with Planning Center to continue",
    });
  }

  const linkedAccounts = await auth.api.listUserAccounts({
    headers: request.headers,
  });

  const planningCenterAccounts = linkedAccounts
    .filter((account) => account.providerId === PLANNING_CENTER_PROVIDER_ID)
    .toSorted((a, b) => {
      const aTime = new Date(a.updatedAt).getTime();
      const bTime = new Date(b.updatedAt).getTime();
      return bTime - aTime;
    });

  const selectedAccountId = getSelectedPlanningCenterAccountId(request);
  const selectedAccount =
    (isNonEmptyString(selectedAccountId)
      ? planningCenterAccounts.find(
          (account) => account.id === selectedAccountId
        )
      : null) ?? planningCenterAccounts.at(0);

  if (!selectedAccount) {
    throw new Unauthenticated({
      message: "No Planning Center account is linked for this user.",
    });
  }

  const token = await getPlanningCenterToken(request.headers, selectedAccount);
  return {
    session,
    ...token,
    accountId: selectedAccount.id,
    account: selectedAccount,
  };
};
