import { RequestContext } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import { Forbidden } from "@pcobooster/api/application/errors/forbidden";
import { NotFound } from "@pcobooster/api/application/errors/not-found";
import { PersistenceFailure } from "@pcobooster/api/application/errors/persistence-failure";
import { Unauthenticated } from "@pcobooster/api/application/errors/unauthenticated";
import { auth } from "@pcobooster/api/auth";
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
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import { Effect } from "effect";

const PLANNING_CENTER_PROVIDER_ID = "planning-center";

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
}

export interface IdentityDependencies {
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

export const getSessionStatus = (
  dependencies: IdentityDependencies = defaultIdentityDependencies
): Effect.Effect<
  { readonly authenticated: boolean },
  ApplicationFault,
  RequestContext
> =>
  Effect.gen(function* readSessionStatus() {
    if (dependencies.isDevAuthBypassEnabled()) {
      return { authenticated: true };
    }
    const { headers } = yield* RequestContext;
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
    const { request, headers } = yield* RequestContext;
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
    const { headers } = yield* RequestContext;
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
  > = defaultIdentityDependencies
): Effect.Effect<
  { readonly enabled: boolean },
  ApplicationFault,
  RequestContext
> =>
  Effect.gen(function* readAdminFeature() {
    const { headers } = yield* RequestContext;
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
