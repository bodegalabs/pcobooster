import { createAuth } from "@pcobooster/api/auth";
import { PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE } from "@pcobooster/api/auth/planning-center-session";
import { createDatabase } from "@pcobooster/api/db/client";
import { account, activityEvents, user } from "@pcobooster/api/db/schema";
import { PLANNING_CENTER_USER_AGENT } from "@pcobooster/api/planning-center/user-agent";
import { testServerConfig } from "@pcobooster/api/testing/server";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createLocalD1 } from "../../../../scripts/database/local-d1";
import { LOCAL_WORKER_TEST_TIMEOUT_MS } from "../../../../scripts/testing/miniflare";

const { runtime, binding } = await createLocalD1("planning-center-sign-in");
const database = createDatabase(binding);
const origin = testServerConfig().publicOrigin;

interface PlanningCenterProfile {
  sub: string;
  email: string | null;
  organizationId: string;
  organizationName: string;
}

const signInResponseSchema = z.object({ url: z.string() });

/** The `User-Agent` each Planning Center request carried, keyed by path. */
const userAgentsByPath = new Map<string, string | null>();

/** Serves Planning Center's OIDC endpoints for one profile, like one org login. */
const stubPlanningCenter = (profile: PlanningCenterProfile): void => {
  const realFetch = globalThis.fetch;
  userAgentsByPath.clear();
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.hostname !== "api.planningcenteronline.com") {
        return await realFetch(input, init);
      }
      userAgentsByPath.set(
        url.pathname,
        new Headers(
          init?.headers ?? (input instanceof Request ? input.headers : {})
        ).get("user-agent")
      );
      if (url.pathname === "/.well-known/openid-configuration") {
        return Response.json({
          issuer: "https://api.planningcenteronline.com",
          authorization_endpoint:
            "https://api.planningcenteronline.com/oauth/authorize",
          token_endpoint: "https://api.planningcenteronline.com/oauth/token",
          userinfo_endpoint:
            "https://api.planningcenteronline.com/oauth/userinfo",
          id_token_signing_alg_values_supported: ["RS256"],
        });
      }
      if (url.pathname === "/oauth/token") {
        return Response.json({
          access_token: `access-${profile.sub}`,
          refresh_token: `refresh-${profile.sub}`,
          token_type: "Bearer",
          expires_in: 7200,
          scope: "openid services people",
        });
      }
      if (url.pathname === "/oauth/userinfo") {
        // Planning Center sends no `email_verified` claim.
        return Response.json({
          sub: profile.sub,
          name: "Jordan Example",
          email: profile.email,
          organization_id: profile.organizationId,
          organization_name: profile.organizationName,
        });
      }
      return new Response("not found", { status: 404 });
    }
  );
};

const cookieHeader = (response: Response): string =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

/** Runs sign-in start and the provider callback; returns the callback response. */
const completePlanningCenterSignIn = async (
  profile: PlanningCenterProfile
): Promise<Response> => {
  stubPlanningCenter(profile);
  const auth = createAuth(testServerConfig(), database);
  const start = await auth.handler(
    new Request(`${origin}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({
        provider: "planning-center",
        callbackURL: "/services",
        errorCallbackURL: "/auth",
        disableRedirect: true,
      }),
    })
  );
  const { url } = signInResponseSchema.parse(await start.json());
  const state = new URL(url).searchParams.get("state") ?? "";
  return await auth.handler(
    new Request(
      `${origin}/api/auth/callback/planning-center?code=test-code&state=${encodeURIComponent(state)}`,
      { headers: { cookie: cookieHeader(start) } }
    )
  );
};

/** Runs sign-in start and the provider callback; returns the callback redirect. */
const signInWithPlanningCenter = async (
  profile: PlanningCenterProfile
): Promise<URL> => {
  const callback = await completePlanningCenterSignIn(profile);
  return new URL(callback.headers.get("location") ?? "", origin);
};

/** The account a callback response selected with the selection cookie, if any. */
const selectedAccountCookie = (response: Response): string | null => {
  const prefix = `${PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE}=`;
  const cookie = response.headers
    .getSetCookie()
    .find((candidate) => candidate.startsWith(prefix));
  return cookie === undefined
    ? null
    : (cookie.split(";")[0] ?? "").slice(prefix.length);
};

const accountIdFor = async (
  planningCenterPersonId: string
): Promise<string> => {
  const [row] = await database
    .select({ id: account.id })
    .from(account)
    .where(eq(account.accountId, planningCenterPersonId));
  return row?.id ?? "";
};

describe(
  "Planning Center sign-in",
  { timeout: LOCAL_WORKER_TEST_TIMEOUT_MS },
  () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    afterAll(async () => {
      await runtime.dispose();
    });

    it("links a second organization for the same Planning Center login", async () => {
      const first = await signInWithPlanningCenter({
        sub: "person-org-a",
        email: "jordan@example.com",
        organizationId: "org-a",
        organizationName: "Grace Church",
      });
      expect(first.searchParams.get("error")).toBeNull();
      expect(first.pathname).toBe("/services");

      const second = await signInWithPlanningCenter({
        sub: "person-org-b",
        email: "jordan@example.com",
        organizationId: "org-b",
        organizationName: "Hope Chapel",
      });
      expect(second.searchParams.get("error")).toBeNull();
      expect(second.pathname).toBe("/services");

      const [signedIn] = await database
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, "jordan@example.com"));
      const linked = await database
        .select({ accountId: account.accountId })
        .from(account)
        .where(eq(account.userId, signedIn?.id ?? ""));
      expect(linked.map((row) => row.accountId).toSorted()).toStrictEqual([
        "person-org-a",
        "person-org-b",
      ]);
    });

    it("selects the organization each sign-in used", async () => {
      const graceChurch = {
        sub: "person-select-a",
        email: "casey@example.com",
        organizationId: "org-select-a",
        organizationName: "Grace Church",
      };
      const hopeChapel = {
        sub: "person-select-b",
        email: "casey@example.com",
        organizationId: "org-select-b",
        organizationName: "Hope Chapel",
      };

      const firstSignIn = await completePlanningCenterSignIn(graceChurch);
      expect(selectedAccountCookie(firstSignIn)).toBe(
        await accountIdFor(graceChurch.sub)
      );
      // Linking a second organization selects it.
      const linked = await completePlanningCenterSignIn(hopeChapel);
      expect(selectedAccountCookie(linked)).toBe(
        await accountIdFor(hopeChapel.sub)
      );
      // Signing in with an organization already linked selects it again.
      const returning = await completePlanningCenterSignIn(graceChurch);
      expect(selectedAccountCookie(returning)).toBe(
        await accountIdFor(graceChurch.sub)
      );
      expect(
        returning.headers
          .getSetCookie()
          .find((candidate) =>
            candidate.startsWith(`${PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE}=`)
          )
      ).toMatch(/; Max-Age=2592000; Path=\/; HttpOnly; SameSite=Lax$/u);
    });

    it("identifies itself to Planning Center on every sign-in request", async () => {
      await signInWithPlanningCenter({
        sub: "person-user-agent",
        email: "agent@example.com",
        organizationId: "org-ua",
        organizationName: "Agent Church",
      });
      expect(Object.fromEntries(userAgentsByPath)).toStrictEqual({
        "/.well-known/openid-configuration": PLANNING_CENTER_USER_AGENT,
        "/oauth/token": PLANNING_CENTER_USER_AGENT,
        "/oauth/userinfo": PLANNING_CENTER_USER_AGENT,
      });
    });

    it("records the parsed failure when the callback redirects with an error", async () => {
      const failed = await signInWithPlanningCenter({
        sub: "person-without-email",
        email: null,
        organizationId: "org-c",
        organizationName: "New Life",
      });
      expect(failed.pathname).toBe("/auth");
      expect(failed.searchParams.get("error")).toBe("email_not_found");

      const [recorded] = await database
        .select({
          success: activityEvents.success,
          errorCode: activityEvents.errorCode,
          metadata: activityEvents.metadata,
        })
        .from(activityEvents)
        .where(eq(activityEvents.eventType, "auth_sign_in_failed"));
      expect(recorded).toStrictEqual({
        success: false,
        errorCode: "email_not_found",
        metadata: { code: "email_not_found" },
      });
    });
  }
);
