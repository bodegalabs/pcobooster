import {
  createRequestContext,
  RequestContext,
} from "@pcobooster/api/application/context";
import {
  getPlanningCenterAccounts,
  getSessionStatus,
  selectPlanningCenterAccount,
} from "@pcobooster/api/application/identity";
import type { IdentityDependencies } from "@pcobooster/api/application/identity";
import type { DemoConfiguration } from "@pcobooster/api/auth/demo-access";
import {
  getDevBypassPlanningCenterAccount,
  getDevBypassSession,
  loadDevBypassIdentity,
} from "@pcobooster/api/auth/dev-bypass";
import { Server } from "@pcobooster/api/server";
import { testServer } from "@pcobooster/api/testing/server";
import { Cause, Effect, Exit, Option } from "effect";
import { describe, expect, it, vi } from "vitest";

const request = new Request("https://pcobooster.com/api/rpc/accounts");

const provide = <Value, Failure>(
  program: Effect.Effect<Value, Failure, RequestContext | Server>
) =>
  program.pipe(
    Effect.provideService(RequestContext, createRequestContext(request)),
    Effect.provideService(Server, testServer())
  );

const run = async <Value>(
  program: Effect.Effect<Value, unknown, RequestContext | Server>
) => await Effect.runPromise(provide(program));

const runExit = async <Value, Failure extends { readonly _tag: string }>(
  program: Effect.Effect<Value, Failure, RequestContext | Server>
) => await Effect.runPromiseExit(provide(program));

const failureTag = (exit: Exit.Exit<unknown, { readonly _tag: string }>) => {
  const cause = Option.getOrThrow(Exit.getCause(exit));
  return Option.getOrThrow(Cause.findErrorOption(cause))._tag;
};

const unauthenticatedDependencies = (): IdentityDependencies => ({
  resolveDemoSession: () => null,
  loadDemoOrganization: vi
    .fn<IdentityDependencies["loadDemoOrganization"]>()
    .mockRejectedValue(new Error("Demo is not configured")),
  isDevAuthBypassEnabled: () => false,
  loadDevBypassIdentity: async () => await loadDevBypassIdentity(null),
  getDevBypassSession,
  getDevBypassPlanningCenterAccount,
  getSession: vi
    .fn<IdentityDependencies["getSession"]>()
    .mockResolvedValue(null),
  listUserAccounts: vi
    .fn<IdentityDependencies["listUserAccounts"]>()
    .mockResolvedValue([]),
  getIdentityForAccount: vi
    .fn<IdentityDependencies["getIdentityForAccount"]>()
    .mockResolvedValue(null),
  getSelectedAccountId: () => null,
});

const nonPlanningCenterAccount = {
  id: "github-account",
  accountId: "github-user",
  providerId: "github",
  userId: "user-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  scopes: [],
} satisfies Awaited<
  ReturnType<IdentityDependencies["listUserAccounts"]>
>[number];

const planningCenterAccount = (
  id: string,
  updatedAt: string
): Awaited<ReturnType<IdentityDependencies["listUserAccounts"]>>[number] => ({
  id,
  accountId: `provider-${id}`,
  providerId: "planning-center",
  userId: "user-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date(updatedAt),
  scopes: [],
});

const authenticatedDependencies = (): IdentityDependencies => ({
  ...unauthenticatedDependencies(),
  getSession: vi
    .fn<IdentityDependencies["getSession"]>()
    .mockResolvedValue(getDevBypassSession()),
  listUserAccounts: vi
    .fn<IdentityDependencies["listUserAccounts"]>()
    .mockResolvedValue([nonPlanningCenterAccount]),
});

const demoConfiguration: DemoConfiguration = {
  accessKey: "demo-access-key-for-identity-tests",
  planningCenter: { applicationId: "demo-app", secret: "demo-secret" },
};

const demoDependencies = () => {
  const loadDemoOrganization = vi
    .fn<IdentityDependencies["loadDemoOrganization"]>()
    .mockResolvedValue({ id: "org-1", name: "Grace Demo Church" });
  const dependencies: IdentityDependencies = {
    ...authenticatedDependencies(),
    resolveDemoSession: () => demoConfiguration,
    loadDemoOrganization,
  };
  return { dependencies, loadDemoOrganization };
};

describe("identity application programs", () => {
  it("reports a guest session as unauthenticated", async () => {
    await expect(
      run(getSessionStatus(unauthenticatedDependencies()))
    ).resolves.toStrictEqual({
      authenticated: false,
    });
  });

  it("rejects account listing for a guest session", async () => {
    expect(
      failureTag(
        await runExit(getPlanningCenterAccounts(unauthenticatedDependencies()))
      )
    ).toBe("Unauthenticated");
  });

  it("rejects selection when the account is not owned through Planning Center", async () => {
    expect(
      failureTag(
        await runExit(
          selectPlanningCenterAccount(
            { accountId: nonPlanningCenterAccount.id },
            authenticatedDependencies()
          )
        )
      )
    ).toBe("NotFound");
  });

  it("falls back from a stale selected cookie and degrades provider identities to null", async () => {
    const newest = planningCenterAccount("newest", "2026-02-01T00:00:00.000Z");
    const oldest = planningCenterAccount("oldest", "2026-01-01T00:00:00.000Z");
    const dependencies: IdentityDependencies = {
      ...authenticatedDependencies(),
      listUserAccounts: vi
        .fn<IdentityDependencies["listUserAccounts"]>()
        .mockResolvedValue([oldest, newest]),
      getIdentityForAccount: vi
        .fn<IdentityDependencies["getIdentityForAccount"]>()
        .mockRejectedValue(new Error("userinfo unavailable")),
      getSelectedAccountId: () => "stale-account",
    };

    const result = await run(getPlanningCenterAccounts(dependencies));

    expect(result).toMatchObject({
      demo: false,
      selectedAccountId: "newest",
      accounts: [
        { id: "newest", identity: null },
        { id: "oldest", identity: null },
      ],
    });
    expect(Object.keys(result.accounts[0]).toSorted()).toStrictEqual([
      "id",
      "identity",
      "providerId",
      "updatedAt",
    ]);
  });

  it("presents a demo session as the demo organization, ahead of any signed-in account", async () => {
    const { dependencies, loadDemoOrganization } = demoDependencies();

    await expect(run(getSessionStatus(dependencies))).resolves.toStrictEqual({
      authenticated: true,
    });
    await expect(
      run(getPlanningCenterAccounts(dependencies))
    ).resolves.toMatchObject({
      demo: true,
      selectedAccountId: "demo",
      session: { name: "Guest", email: "", image: null },
      accounts: [
        {
          id: "demo",
          identity: {
            organizationId: "org-1",
            organizationName: "Grace Demo Church",
          },
        },
      ],
    });
    expect(loadDemoOrganization).toHaveBeenCalledWith(
      demoConfiguration,
      expect.any(AbortSignal)
    );
    expect(dependencies.getSession).not.toHaveBeenCalled();
  });

  it("only selects the demo account during a demo session", async () => {
    const { dependencies } = demoDependencies();

    await expect(
      run(selectPlanningCenterAccount({ accountId: "demo" }, dependencies))
    ).resolves.toStrictEqual({ success: true, selectedAccountId: "demo" });
    expect(
      failureTag(
        await runExit(
          selectPlanningCenterAccount({ accountId: "newest" }, dependencies)
        )
      )
    ).toBe("NotFound");
  });
});
