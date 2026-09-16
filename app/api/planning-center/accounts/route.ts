import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import {
  getDevBypassPlanningCenterAccount,
  getDevBypassSession,
  isDevAuthBypassEnabled,
  loadDevBypassIdentity,
} from "@/lib/auth/dev-bypass";
import { getPlanningCenterIdentityForAccount } from "@/lib/auth/planning-center-identity";
import {
  getSelectedPlanningCenterAccountId,
  PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE,
} from "@/lib/auth/planning-center-session";
import { ApiError } from "@/lib/http/api-error";
import { handleRoute } from "@/lib/http/route-handler";

const PLANNING_CENTER_PROVIDER_ID = "planning-center";

const postBodySchema = z.object({
  accountId: z.string().min(1),
});

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleRoute(async () => {
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
      .sort((a, b) => {
        const aTime = new Date(a.updatedAt).getTime();
        const bTime = new Date(b.updatedAt).getTime();
        return bTime - aTime;
      });

    const selectedFromCookie = getSelectedPlanningCenterAccountId(request);
    const selectedAccount =
      (selectedFromCookie
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
          account.id
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
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    if (isDevAuthBypassEnabled()) {
      const devAccount = getDevBypassPlanningCenterAccount();
      return NextResponse.json({
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

    const response = NextResponse.json({
      success: true,
      selectedAccountId: account.id,
    });

    response.cookies.set(
      PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE,
      encodeURIComponent(account.id),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
      }
    );

    return response;
  });
}
