import { Unauthenticated } from "@pcobooster/api/application/errors/unauthenticated";
import type { Auth } from "@pcobooster/api/auth";
import { getDevBypassSession } from "@pcobooster/api/auth/dev-bypass";
import {
  createAuthTokenApi,
  getPlanningCenterToken,
} from "@pcobooster/api/auth/planning-center-token";
import { readCookie } from "@pcobooster/api/http/cookies";
import type { ServerDependencies } from "@pcobooster/api/server";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";

const PLANNING_CENTER_PROVIDER_ID = "planning-center";
export const PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE =
  "pco-selected-account-id";

/** How cookieless clients (the native app) name their selected account; read before the cookie. */
export const PLANNING_CENTER_SELECTED_ACCOUNT_HEADER = "x-pcobooster-account";

/**
 * The account row id the caller selected, from the header or else the cookie. It is only a
 * choice among the session user's own linked accounts: every caller matches it against them
 * and falls back to the first one, so a foreign or stale id never selects another account.
 */
export const getSelectedPlanningCenterAccountId = (
  request: Request
): string | null => {
  const header = request.headers
    .get(PLANNING_CENTER_SELECTED_ACCOUNT_HEADER)
    ?.trim();
  return isNonEmptyString(header)
    ? header
    : readCookie(request, PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE);
};

interface LinkedAccount {
  readonly providerId: string;
  readonly createdAt: Date | string;
}

/**
 * A user's Planning Center accounts (one per organization), first linked first. A request
 * without a selection (header or cookie) acts as the first one. Not newest `updatedAt` first:
 * Better Auth rewrites it on every token refresh, so refreshing one organization's token
 * switched every later request to that organization, including requests for the other one's
 * plans.
 */
export const linkedPlanningCenterAccounts = <Account extends LinkedAccount>(
  accounts: readonly Account[]
): Account[] =>
  accounts
    .filter((account) => account.providerId === PLANNING_CENTER_PROVIDER_ID)
    .toSorted(
      (first, second) =>
        new Date(first.createdAt).getTime() -
        new Date(second.createdAt).getTime()
    );

export interface PlanningCenterUserAuthContext {
  session: NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
  accessToken: string;
  scopes: string[];
  accountId: string;
  account: { id: string; accountId: string };
}

export const requirePlanningCenterAccessToken = async (
  { auth, config }: Pick<ServerDependencies, "auth" | "config">,
  request: Request
): Promise<PlanningCenterUserAuthContext> => {
  if (config.devAuthBypass) {
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

  const planningCenterAccounts = linkedPlanningCenterAccounts(linkedAccounts);

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

  const token = await getPlanningCenterToken(
    request.headers,
    selectedAccount,
    createAuthTokenApi(auth)
  );
  return {
    session,
    ...token,
    accountId: selectedAccount.id,
    account: selectedAccount,
  };
};
