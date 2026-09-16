import { auth } from "@/lib/auth";
import {
  getDevBypassSession,
  isDevAuthBypassEnabled,
} from "@/lib/auth/dev-bypass";
import { ApiError } from "@/lib/http/api-error";
import { runWithPlanningCenterRequestAuth } from "@/lib/planning-center/request-auth-context";

const PLANNING_CENTER_PROVIDER_ID = "planning-center";
export const PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE =
  "pco-selected-account-id";

function getCookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  const segments = header.split(";").map((segment) => segment.trim());
  for (const segment of segments) {
    const [key, ...valueParts] = segment.split("=");
    if (key !== name) continue;
    const value = valueParts.join("=");
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

export function getSelectedPlanningCenterAccountId(
  request: Request
): string | null {
  return getCookieValue(request, PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE);
}

export type PlanningCenterUserAuthContext = {
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
  accessToken: string;
  scopes: string[];
  accountId: string;
};

export async function requirePlanningCenterAccessToken(request: Request) {
  if (isDevAuthBypassEnabled()) {
    return {
      session: getDevBypassSession() as unknown as NonNullable<
        Awaited<ReturnType<typeof auth.api.getSession>>
      >,
      accessToken: "",
      scopes: [],
      accountId: "dev-bypass-account",
    };
  }

  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    throw new ApiError(
      401,
      "UNAUTHORIZED",
      "Sign in with Planning Center to continue"
    );
  }

  const linkedAccounts = await auth.api.listUserAccounts({
    headers: request.headers,
  });

  const planningCenterAccounts = linkedAccounts
    .filter((account) => account.providerId === PLANNING_CENTER_PROVIDER_ID)
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt).getTime();
      const bTime = new Date(b.updatedAt).getTime();
      return bTime - aTime;
    });

  const selectedAccountId = getSelectedPlanningCenterAccountId(request);
  const selectedAccount =
    (selectedAccountId
      ? planningCenterAccounts.find(
          (account) => account.id === selectedAccountId
        )
      : null) ?? planningCenterAccounts[0];

  if (!selectedAccount) {
    throw new ApiError(
      401,
      "PLANNING_CENTER_NOT_LINKED",
      "No Planning Center account is linked for this user."
    );
  }

  try {
    const token = await auth.api.getAccessToken({
      headers: request.headers,
      body: {
        providerId: PLANNING_CENTER_PROVIDER_ID,
        accountId: selectedAccount.id,
      },
    });

    return {
      session,
      accessToken: token.accessToken,
      scopes: token.scopes,
      accountId: selectedAccount.id,
    };
  } catch {
    const refreshed = await auth.api.refreshToken({
      headers: request.headers,
      body: {
        providerId: PLANNING_CENTER_PROVIDER_ID,
        accountId: selectedAccount.id,
      },
    });

    if (!refreshed.accessToken) {
      throw new ApiError(
        401,
        "PLANNING_CENTER_REAUTH_REQUIRED",
        "Planning Center connection expired. Please sign in again."
      );
    }

    return {
      session,
      accessToken: refreshed.accessToken,
      scopes: refreshed.scope
        ? refreshed.scope.split(/\s+/).filter(Boolean)
        : [],
      accountId: selectedAccount.id,
    };
  }
}

export async function withPlanningCenterUser<T>(
  request: Request,
  handler: (ctx: PlanningCenterUserAuthContext) => Promise<T>
): Promise<T> {
  const authContext = await requirePlanningCenterAccessToken(request);

  if (!authContext.accessToken) {
    // Dev bypass: skip the per-request bearer so the core client falls back to
    // Basic auth using PLANNING_CENTER_CLIENT/PLANNING_CENTER_PAT.
    return handler(authContext);
  }

  return runWithPlanningCenterRequestAuth(
    { accessToken: authContext.accessToken },
    async () => handler(authContext)
  );
}
