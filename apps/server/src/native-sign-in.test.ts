import { createAuth } from "@pcobooster/api/auth";
import {
  createPlanningCenterStub,
  exchangeRun,
  parseExchange,
  runNativeSignIn,
  signInNatively,
} from "@pcobooster/api/auth/native-sign-in.fixture";
import type { PlanningCenterProfile } from "@pcobooster/api/auth/native-sign-in.fixture";
import { PLANNING_CENTER_SELECTED_ACCOUNT_HEADER } from "@pcobooster/api/auth/planning-center-session";
import { createDatabase } from "@pcobooster/api/db/client";
import { account } from "@pcobooster/api/db/schema";
import { appRouter } from "@pcobooster/api/orpc";
import { testServer, testServerConfig } from "@pcobooster/api/testing/server";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createLocalD1 } from "../../../scripts/database/local-d1";
import { createServerApp } from "./app";

type TestErrorLogger = (bindings: { err: unknown }, message: string) => void;

const { runtime, binding } = await createLocalD1("native-sign-in-app");
const database = createDatabase(binding);
const config = testServerConfig();
const origin = config.publicOrigin;
const planningCenter = createPlanningCenterStub(globalThis.fetch);

const sessionStatusSchema = z.object({
  json: z.object({ authenticated: z.boolean() }),
});
const accountsSchema = z.object({
  json: z.object({
    session: z.object({
      userId: z.string(),
      name: z.string(),
      email: z.string(),
      image: z.string().nullable(),
    }),
    selectedAccountId: z.string().nullable(),
    accounts: z.array(
      z.object({
        id: z.string(),
        identity: z
          .object({ organizationName: z.string().nullable() })
          .nullable(),
      })
    ),
    demo: z.boolean(),
  }),
});

let app: Hono;
const handler = async (request: Request): Promise<Response> =>
  await app.request(request);

const profile = (
  name: string,
  email = `${name}@example.com`
): PlanningCenterProfile => ({
  sub: `person-${name}`,
  email,
  organizationId: `org-${name}`,
  organizationName: `${name} Church`,
});

const rpc = async (
  path: string,
  headers: Readonly<Record<string, string>>
): Promise<Response> =>
  await app.request(
    new Request(`${origin}/api/rpc/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ json: {} }),
    })
  );

const isAuthenticated = async (
  headers: Readonly<Record<string, string>>
): Promise<boolean> => {
  const response = await rpc("session/status", headers);
  return sessionStatusSchema.parse(await response.json()).json.authenticated;
};

const listAccounts = async (headers: Readonly<Record<string, string>>) => {
  const response = await rpc("accounts/list", headers);
  return accountsSchema.parse(await response.json()).json;
};

const accountIdFor = async (person: PlanningCenterProfile): Promise<string> => {
  const [row] = await database
    .select({ id: account.id })
    .from(account)
    .where(eq(account.accountId, person.sub));
  return row?.id ?? "";
};

describe("native sign-in through the API Worker", () => {
  beforeAll(async () => {
    vi.stubGlobal("fetch", planningCenter.fetch);
    const auth = createAuth(config, database);
    await auth.$context;
    app = createServerApp({
      server: testServer({ config, database, auth }),
      enableRequestLogging: false,
      log: { error: vi.fn<TestErrorLogger>() },
      reportError: null,
      router: appRouter,
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await runtime.dispose();
  });

  it("hands the app a code through Hono's auth routes", async () => {
    planningCenter.signInAs(profile("round-trip"));
    const run = await runNativeSignIn(handler, origin);
    const exchanged = await exchangeRun(handler, origin, run);

    expect([
      run.start.status,
      run.callback.status,
      exchanged.status,
    ]).toStrictEqual([302, 302, 200]);
    expect(run.redirect.protocol).toBe("pcobooster:");
    expect(run.redirect.searchParams.get("state")).toBe(run.appState);
    await expect(parseExchange(exchanged)).resolves.toHaveProperty("token");
  });

  it("authenticates oRPC calls with the bearer token", async () => {
    const person = profile("rpc");
    planningCenter.signInAs(person);
    const { token, user, selectedAccountId } = await signInNatively(
      handler,
      origin
    );
    const authorization = `Bearer ${token}`;
    const listed = await listAccounts({ authorization });

    await expect(isAuthenticated({ authorization })).resolves.toBeTruthy();
    await expect(isAuthenticated({})).resolves.toBeFalsy();
    expect(listed.session).toStrictEqual({
      userId: user.id,
      name: "Jordan Example",
      email: person.email,
      image: null,
    });
    expect({
      selectedAccountId: listed.selectedAccountId,
      accounts: listed.accounts,
      demo: listed.demo,
    }).toStrictEqual({
      selectedAccountId,
      accounts: [
        {
          id: await accountIdFor(person),
          identity: { organizationName: person.organizationName },
        },
      ],
      demo: false,
    });
  });

  it("selects the organization the account header names, and only the caller's own", async () => {
    const graceChurch = profile("header-a", "header-select@example.com");
    const hopeChapel = profile("header-b", "header-select@example.com");
    const stranger = profile("someone-else");
    planningCenter.signInAs(graceChurch);
    await signInNatively(handler, origin);
    planningCenter.signInAs(hopeChapel);
    const { token } = await signInNatively(handler, origin);
    planningCenter.signInAs(stranger);
    await signInNatively(handler, origin);
    const [first, second, foreign] = await Promise.all(
      [graceChurch, hopeChapel, stranger].map(accountIdFor)
    );

    const selected = await Promise.all(
      [first, second, foreign].map(async (accountId) => {
        const listed = await listAccounts({
          authorization: `Bearer ${token}`,
          [PLANNING_CENTER_SELECTED_ACCOUNT_HEADER]: accountId ?? "",
        });
        return listed.selectedAccountId;
      })
    );

    // Another user's account is never selected: the caller falls back to their first one.
    expect(selected).toStrictEqual([first, second, first]);
  });

  it("revokes the bearer token on sign-out", async () => {
    planningCenter.signInAs(profile("sign-out"));
    const { token } = await signInNatively(handler, origin);
    const authorization = `Bearer ${token}`;

    const signOut = await app.request(
      new Request(`${origin}/api/auth/sign-out`, {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: "{}",
      })
    );
    const accounts = await rpc("accounts/list", { authorization });

    expect(signOut.status).toBe(200);
    await expect(isAuthenticated({ authorization })).resolves.toBeFalsy();
    expect(accounts.status).toBe(401);
  });
});
