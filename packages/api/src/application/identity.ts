import { RequestContext } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import { Forbidden } from "@pcobooster/api/application/errors/forbidden";
import { NotFound } from "@pcobooster/api/application/errors/not-found";
import { PersistenceFailure } from "@pcobooster/api/application/errors/persistence-failure";
import { Unauthenticated } from "@pcobooster/api/application/errors/unauthenticated";
import { auth } from "@pcobooster/api/auth";
import {
  readDemoConfiguration,
  resolveDemoSession,
} from "@pcobooster/api/auth/demo-access";
import type { DemoConfiguration } from "@pcobooster/api/auth/demo-access";
import {
  getDevBypassPlanningCenterAccount,
  getDevBypassSession,
  isDevAuthBypassEnabled,
  loadDevBypassIdentity,
} from "@pcobooster/api/auth/dev-bypass";
import { getPlanningCenterIdentityForAccount } from "@pcobooster/api/auth/planning-center-account-identity";
import { getSelectedPlanningCenterAccountId } from "@pcobooster/api/auth/planning-center-session";
import { isPeoplePageEnabled } from "@pcobooster/api/config/people-page-availability";
import { authorizeAdminRequest } from "@pcobooster/api/modules/admin/authorize-admin";
import {
  getAccountActivity,
  getUserAccountDetail,
  isAdminEmail,
} from "@pcobooster/api/modules/admin/get-account-activity";
import { getDemoOrganization } from "@pcobooster/api/modules/demo/get-demo-organization";
import type { DemoOrganization } from "@pcobooster/api/modules/demo/get-demo-organization";
import { createReadOnlyPlanningCenterServices } from "@pcobooster/api/planning-center/services/factory";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import { Effect } from "effect";

const PLANNING_CENTER_PROVIDER_ID = "planning-center";
const DEMO_ACCOUNT_ID = "demo";

type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>;
type AuthAccount = Awaited<
  ReturnType<typeof auth.api.listUserAccounts>
>[number];

export interface SessionSummary {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly image: string | null;
}

export interface PlanningCenterAccountSummary {
  readonly id: string;
  readonly providerId: string;
  readonly updatedAt: string;
  readonly identity: Awaited<
    ReturnType<typeof getPlanningCenterIdentityForAccount>
  >;
}

export interface PlanningCenterAccountsSummary {
  readonly session: SessionSummary;
  readonly selectedAccountId: string | null;
  readonly accounts: PlanningCenterAccountSummary[];
  readonly demo: boolean;
}

export interface IdentityDependencies {
  readonly resolveDemoSession: (request: Request) => DemoConfiguration | null;
  readonly loadDemoOrganization: (
    configuration: DemoConfiguration,
    signal: AbortSignal
  ) => Promise<DemoOrganization>;
  readonly isDevAuthBypassEnabled: typeof isDevAuthBypassEnabled;
  readonly loadDevBypassIdentity: typeof loadDevBypassIdentity;
  readonly getDevBypassSession: typeof getDevBypassSession;
  readonly getDevBypassPlanningCenterAccount: typeof getDevBypassPlanningCenterAccount;
  readonly getSession: (headers: Headers) => Promise<AuthSession>;
  readonly listUserAccounts: (headers: Headers) => Promise<AuthAccount[]>;
  readonly getIdentityForAccount: typeof getPlanningCenterIdentityForAccount;
  readonly getSelectedAccountId: typeof getSelectedPlanningCenterAccountId;
}

const defaultIdentityDependencies: IdentityDependencies = {
  resolveDemoSession: (request) =>
    resolveDemoSession(request, readDemoConfiguration()),
  loadDemoOrganization: async (configuration, signal) =>
    await getDemoOrganization(
      createReadOnlyPlanningCenterServices(configuration.planningCenter),
      signal
    ),
  isDevAuthBypassEnabled,
  loadDevBypassIdentity,
  getDevBypassSession,
  getDevBypassPlanningCenterAccount,
  getSession: async (headers) => await auth.api.getSession({ headers }),
  listUserAccounts: async (headers) =>
    await auth.api.listUserAccounts({ headers }),
  getIdentityForAccount: getPlanningCenterIdentityForAccount,
  getSelectedAccountId: getSelectedPlanningCenterAccountId,
};

const toIdentityFault = (error: Error, operation: string): ApplicationFault =>
  error instanceof Unauthenticated || error instanceof Forbidden
    ? error
    : new PersistenceFailure({
        message: "Could not load account data.",
        operation,
        cause: error,
      });

const tryIdentity = <Value>(
  operation: () => Promise<Value>,
  operationName: string
): Effect.Effect<Value, ApplicationFault> =>
  Effect.tryPromise({
    try: operation,
    catch: (error) =>
      toIdentityFault(
        error instanceof Error
          ? error
          : new Error("Account data request failed"),
        operationName
      ),
  });

const toSessionSummary = (
  session: NonNullable<AuthSession>
): SessionSummary => ({
  userId: session.user.id,
  name: session.user.name,
  email: session.user.email,
  image: session.user.image ?? null,
});

const toAccountSummary = async (
  request: Request,
  account: AuthAccount,
  dependencies: Pick<IdentityDependencies, "getIdentityForAccount">
): Promise<PlanningCenterAccountSummary> => {
  let identity: Awaited<
    ReturnType<typeof getPlanningCenterIdentityForAccount>
  > = null;
  try {
    identity = await dependencies.getIdentityForAccount(request, account);
  } catch {
    // Account selection remains usable if a provider userinfo lookup fails.
  }
  return {
    id: account.id,
    providerId: account.providerId,
    updatedAt: new Date(account.updatedAt).toISOString(),
    identity,
  };
};

const planningCenterAccounts = (accounts: AuthAccount[]): AuthAccount[] =>
  accounts
    .filter((account) => account.providerId === PLANNING_CENTER_PROVIDER_ID)
    .toSorted(
      (first, second) =>
        new Date(second.updatedAt).getTime() -
        new Date(first.updatedAt).getTime()
    );

const demoAccountsSummary = (
  organization: DemoOrganization
): PlanningCenterAccountsSummary => ({
  session: { userId: DEMO_ACCOUNT_ID, name: "Guest", email: "", image: null },
  selectedAccountId: DEMO_ACCOUNT_ID,
  accounts: [
    {
      id: DEMO_ACCOUNT_ID,
      providerId: PLANNING_CENTER_PROVIDER_ID,
      updatedAt: new Date(0).toISOString(),
      identity: {
        sub: null,
        name: null,
        email: null,
        organizationId: organization.id,
        organizationName: organization.name,
      },
    },
  ],
  demo: true,
});

export const getSessionStatus = (
  dependencies: IdentityDependencies = defaultIdentityDependencies
): Effect.Effect<
  { readonly authenticated: boolean },
  ApplicationFault,
  RequestContext
> =>
  Effect.gen(function* readSessionStatus() {
    const { request, headers } = yield* RequestContext;
    if (
      dependencies.resolveDemoSession(request) !== null ||
      dependencies.isDevAuthBypassEnabled()
    ) {
      return { authenticated: true };
    }
    const session = yield* tryIdentity(
      async () => await dependencies.getSession(headers),
      "session-status"
    );
    return { authenticated: session !== null };
  });

export const getPlanningCenterAccounts = (
  dependencies: IdentityDependencies = defaultIdentityDependencies
): Effect.Effect<
  PlanningCenterAccountsSummary,
  ApplicationFault,
  RequestContext
> =>
  Effect.gen(function* listPlanningCenterAccounts() {
    const { request, headers, signal } = yield* RequestContext;
    const demo = dependencies.resolveDemoSession(request);
    if (demo) {
      const organization = yield* tryIdentity(
        async () => await dependencies.loadDemoOrganization(demo, signal),
        "demo-organization"
      );
      return demoAccountsSummary(organization);
    }
    if (dependencies.isDevAuthBypassEnabled()) {
      const identity = yield* tryIdentity(
        async () => await dependencies.loadDevBypassIdentity(),
        "dev-bypass-identity"
      );
      const session = dependencies.getDevBypassSession(identity);
      const account = dependencies.getDevBypassPlanningCenterAccount(identity);
      return {
        session: toSessionSummary(session),
        selectedAccountId: account.id,
        accounts: [
          {
            id: account.id,
            providerId: account.providerId,
            updatedAt: account.updatedAt,
            identity: account.identity,
          },
        ],
        demo: false,
      };
    }

    const session = yield* tryIdentity(
      async () => await dependencies.getSession(headers),
      "session"
    );
    if (session === null) {
      return yield* Effect.fail(
        new Unauthenticated({ message: "Sign in required" })
      );
    }
    const accounts = yield* tryIdentity(
      async () => await dependencies.listUserAccounts(headers),
      "list-user-accounts"
    );
    const linkedAccounts = planningCenterAccounts(accounts);
    const cookieAccountId = dependencies.getSelectedAccountId(request);
    const selectedAccount =
      (isNonEmptyString(cookieAccountId)
        ? linkedAccounts.find((account) => account.id === cookieAccountId)
        : undefined) ?? linkedAccounts[0];
    const summaries = yield* tryIdentity(
      async () =>
        await Promise.all(
          linkedAccounts.map(
            async (account) =>
              await toAccountSummary(request, account, dependencies)
          )
        ),
      "planning-center-identities"
    );
    return {
      session: toSessionSummary(session),
      selectedAccountId: selectedAccount?.id ?? null,
      accounts: summaries,
      demo: false,
    };
  });

export const selectPlanningCenterAccount = (
  input: { readonly accountId: string },
  dependencies: IdentityDependencies = defaultIdentityDependencies
): Effect.Effect<
  { readonly success: true; readonly selectedAccountId: string },
  ApplicationFault,
  RequestContext
> =>
  Effect.gen(function* selectAccount() {
    const { request, headers } = yield* RequestContext;
    if (dependencies.resolveDemoSession(request) !== null) {
      if (input.accountId !== DEMO_ACCOUNT_ID) {
        return yield* Effect.fail(
          new NotFound({
            message: "Planning Center account not found.",
            resource: "planning-center-account",
          })
        );
      }
      return { success: true, selectedAccountId: DEMO_ACCOUNT_ID };
    }
    if (dependencies.isDevAuthBypassEnabled()) {
      const account = dependencies.getDevBypassPlanningCenterAccount();
      return { success: true, selectedAccountId: account.id };
    }
    const session = yield* tryIdentity(
      async () => await dependencies.getSession(headers),
      "session"
    );
    if (session === null) {
      return yield* Effect.fail(
        new Unauthenticated({ message: "Sign in required" })
      );
    }
    const accounts = yield* tryIdentity(
      async () => await dependencies.listUserAccounts(headers),
      "list-user-accounts"
    );
    const account = accounts.find(
      (candidate) =>
        candidate.id === input.accountId &&
        candidate.providerId === PLANNING_CENTER_PROVIDER_ID
    );
    if (!account) {
      return yield* Effect.fail(
        new NotFound({
          message: "Planning Center account not found.",
          resource: "planning-center-account",
        })
      );
    }
    return { success: true, selectedAccountId: account.id };
  });

export const getPeopleFeature = Effect.sync(() => ({
  enabled: isPeoplePageEnabled(),
}));

export const getAdminFeature = (
  dependencies: Pick<
    IdentityDependencies,
    | "getSession"
    | "getDevBypassSession"
    | "isDevAuthBypassEnabled"
    | "loadDevBypassIdentity"
    | "resolveDemoSession"
  > = defaultIdentityDependencies
): Effect.Effect<
  { readonly enabled: boolean },
  ApplicationFault,
  RequestContext
> =>
  Effect.gen(function* readAdminFeature() {
    const { request, headers } = yield* RequestContext;
    if (dependencies.resolveDemoSession(request) !== null) {
      return { enabled: false };
    }
    const session = dependencies.isDevAuthBypassEnabled()
      ? dependencies.getDevBypassSession(
          yield* tryIdentity(
            async () => await dependencies.loadDevBypassIdentity(),
            "dev-bypass-identity"
          )
        )
      : yield* tryIdentity(
          async () => await dependencies.getSession(headers),
          "session"
        );
    return { enabled: isAdminEmail(session?.user.email) };
  });

export const getAdminAccounts = Effect.gen(function* readAdminAccounts() {
  const { request } = yield* RequestContext;
  const session = yield* tryIdentity(
    async () => await authorizeAdminRequest(request),
    "authorize-admin"
  );
  const accounts = yield* tryIdentity(
    async () => await getAccountActivity(),
    "get-account-activity"
  );
  return { email: session.user.email, accounts };
});

export const getAdminUser = (input: {
  readonly userId: string;
}): Effect.Effect<
  { readonly user: Awaited<ReturnType<typeof getUserAccountDetail>> },
  ApplicationFault,
  RequestContext
> =>
  Effect.gen(function* readAdminUser() {
    const { request } = yield* RequestContext;
    yield* tryIdentity(
      async () => await authorizeAdminRequest(request),
      "authorize-admin"
    );
    const user = yield* tryIdentity(
      async () => await getUserAccountDetail(input.userId),
      "get-user-account-detail"
    );
    return { user };
  });
