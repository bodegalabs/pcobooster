import { auth } from "@worship-admin/api/auth";
import {
  getDevBypassPlanningCenterAccount,
  getDevBypassSession,
  isDevAuthBypassEnabled,
  loadDevBypassIdentity,
} from "@worship-admin/api/auth/dev-bypass";
import { getPlanningCenterIdentityForAccount } from "@worship-admin/api/auth/planning-center-account-identity";
import {
  getSelectedPlanningCenterAccountId,
  PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE,
} from "@worship-admin/api/auth/planning-center-session";
import { ApiError } from "@worship-admin/api/http/api-error";
import { handleRoute } from "@worship-admin/api/http/route-handler";
import { isNonEmptyString } from "@worship-admin/api/json";
import { z } from "zod";

const PLANNING_CENTER_PROVIDER_ID = "planning-center";

const postBodySchema = z.object({
  accountId: z.string().min(1),
});

export const dynamic = "force-dynamic";

export const GET = async (request: Request) =>
  await handleRoute(async () => {
    if (isDevAuthBypassEnabled()) {
      const identity = await loadDevBypassIdentity();
      const devSession = getDevBypassSession(identity);
      const devAccount = getDevBypassPlanningCenterAccount(identity);
      return {
        session: {
          userId: devSession.user.id,
          name: devSession.user.name,
          email: devSession.user.email,
          image: devSession.user.image,
        },
        selectedAccountId: devAccount.id,
        accounts: [devAccount],
      };
    }

    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    }

    const allAccounts = await auth.api.listUserAccounts({
      headers: request.headers,
    });

    const planningCenterAccounts = allAccounts
      .filter((account) => account.providerId === PLANNING_CENTER_PROVIDER_ID)
      .toSorted((a, b) => {
        const aTime = new Date(a.updatedAt).getTime();
        const bTime = new Date(b.updatedAt).getTime();
        return bTime - aTime;
      });

    const selectedFromCookie = getSelectedPlanningCenterAccountId(request);
    const selectedAccount =
      (isNonEmptyString(selectedFromCookie)
        ? planningCenterAccounts.find(
            (account) => account.id === selectedFromCookie
          )
        : null) ??
      planningCenterAccounts[0] ??
      null;

    const accountsWithIdentity = await Promise.all(
      planningCenterAccounts.map(async (account) => {
        const identity = await getPlanningCenterIdentityForAccount(
          request,
          account
        );
        return {
          ...account,
          identity,
        };
      })
    );

    return {
      session: {
        userId: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image ?? null,
      },
      selectedAccountId: selectedAccount?.id ?? null,
      accounts: accountsWithIdentity,
    };
  });

export const POST = async (request: Request) =>
  await handleRoute(async () => {
    if (isDevAuthBypassEnabled()) {
      const devAccount = getDevBypassPlanningCenterAccount();
      return Response.json({
        success: true,
        selectedAccountId: devAccount.id,
      });
    }

    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    }

    const parsed = postBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Invalid request",
        parsed.error.issues
      );
    }

    const allAccounts = await auth.api.listUserAccounts({
      headers: request.headers,
    });

    const account = allAccounts.find(
      (candidate) =>
        candidate.id === parsed.data.accountId &&
        candidate.providerId === PLANNING_CENTER_PROVIDER_ID
    );

    if (!account) {
      throw new ApiError(404, "NOT_FOUND", "Planning Center account not found");
    }

    const response = Response.json({
      success: true,
      selectedAccountId: account.id,
    });

    const cookie = [
      `${PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE}=${encodeURIComponent(account.id)}`,
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${60 * 60 * 24 * 30}`,
      "Path=/",
    ];
    if (process.env.NODE_ENV === "production") {
      cookie.push("Secure");
    }
    response.headers.append("Set-Cookie", cookie.join("; "));

    return response;
  });
