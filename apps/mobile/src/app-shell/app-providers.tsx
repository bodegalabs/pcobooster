import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { ErrorToastProvider } from "../components/error-toast";
import { launchOptions } from "../harness/current-launch-options";
import { FIXTURE_ANCHOR_NOW } from "../harness/launch-options";
import {
  ClockProvider,
  FALLBACK_TIME_ZONE,
  OrgTimeZoneProvider,
} from "../lib/environment";
import type { AppClock } from "../lib/environment";
import { useToasts } from "../lib/toasts";
import { makeAppClient } from "./app-client";
import { mockDeviceAccounts } from "./device-accounts";
import type { DeviceAccount } from "./device-accounts";
import { ProductClientContext, sharedReads, useProductClient } from "./queries";
import { SessionContext } from "./session";
import type { SessionValue } from "./session";

const fixedClock: AppClock = { now: () => FIXTURE_ANCHOR_NOW };
const systemClock: AppClock = { now: () => new Date() };

const appClock = launchOptions.fixedNow ? fixedClock : systemClock;

interface SessionState {
  readonly accounts: readonly DeviceAccount[];
  readonly activeUserId: string | null;
}

/** The seeded mock session (`-PCOBMockSession`); outside mock mode nobody is remembered yet. */
const initialSession = (): SessionState => {
  if (!launchOptions.mock) {
    return { accounts: [], activeUserId: null };
  }
  const accounts = mockDeviceAccounts(appClock.now());
  return {
    accounts,
    activeUserId:
      launchOptions.mockSession === "signedIn"
        ? (accounts[0]?.userId ?? null)
        : null,
  };
};

const SIGN_IN_UNAVAILABLE =
  "Sign-in with Planning Center isn't in this build yet.";

/** One query cache for the app; signing out clears it, and keys carry the account scope. */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

/**
 * The session, the product client and its query cache, the clock, and the organization's time
 * zone. Only the mock session can sign in today: native Planning Center sign-in arrives with the
 * auth layer, so outside mock mode "Sign in" explains that instead.
 */
const SessionProvider = ({ children }: { children: ReactNode }) => {
  const toasts = useToasts();
  const [state, setState] = useState(initialSession);
  const active =
    state.accounts.find((account) => account.userId === state.activeUserId) ??
    null;
  const token = active?.token ?? null;
  // One client per signed-in token: switching accounts builds a new one.
  const client = useMemo(() => makeAppClient(launchOptions, token), [token]);

  const continueAs = useCallback(
    (account: DeviceAccount) => {
      if (!launchOptions.mock) {
        toasts.showError(SIGN_IN_UNAVAILABLE);
        return;
      }
      setState((current) => ({ ...current, activeUserId: account.userId }));
    },
    [toasts]
  );

  const session = useMemo<SessionValue>(
    () => ({
      accounts: state.accounts,
      active,
      signIn: () => {
        const [first] = state.accounts;
        if (first === undefined) {
          toasts.showError(SIGN_IN_UNAVAILABLE);
          return;
        }
        continueAs(first);
      },
      continueAs,
      forget: (account) => {
        setState((current) => ({
          accounts: current.accounts.filter(
            (candidate) => candidate.userId !== account.userId
          ),
          activeUserId:
            current.activeUserId === account.userId
              ? null
              : current.activeUserId,
        }));
      },
      signOut: () => {
        queryClient.clear();
        setState((current) => ({ ...current, activeUserId: null }));
      },
    }),
    [active, continueAs, state.accounts, toasts]
  );

  const clientContext = useMemo(
    () => ({ client, scope: active?.userId ?? "signed-out" }),
    [active?.userId, client]
  );

  return (
    <SessionContext value={session}>
      <QueryClientProvider client={queryClient}>
        <ProductClientContext value={clientContext}>
          {children}
        </ProductClientContext>
      </QueryClientProvider>
    </SessionContext>
  );
};

/** The congregation's zone from `catalog.organization` once signed in, else the fallback. */
const OrganizationTimeZone = ({
  isSignedIn,
  children,
}: {
  isSignedIn: boolean;
  children: ReactNode;
}) => {
  const context = useProductClient();
  const organization = useQuery({
    ...sharedReads.organization(context),
    enabled: isSignedIn,
  });
  return (
    <OrgTimeZoneProvider
      value={organization.data?.timeZone ?? FALLBACK_TIME_ZONE}
    >
      {children}
    </OrgTimeZoneProvider>
  );
};

const SignedInScope = ({ children }: { children: ReactNode }) => {
  const { scope } = useProductClient();
  return (
    <OrganizationTimeZone isSignedIn={scope !== "signed-out"}>
      {children}
    </OrganizationTimeZone>
  );
};

export const AppProviders = ({ children }: { children: ReactNode }) => (
  <ClockProvider value={appClock}>
    <ErrorToastProvider>
      <SessionProvider>
        <SignedInScope>{children}</SignedInScope>
      </SessionProvider>
    </ErrorToastProvider>
  </ClockProvider>
);
