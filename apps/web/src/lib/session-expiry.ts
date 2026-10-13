import { resetAnalytics } from "@pcobooster/analytics/client";
import { failureStatus } from "@pcobooster/client/product-client";

import { clearAccountScopedCaches } from "@/lib/account-scoped-caches";
import { authClient } from "@/lib/auth-client";
import { signInPath } from "@/lib/auth-redirect";

const UNAUTHENTICATED_STATUS = 401;

export interface SessionExpiryDependencies {
  /** Ends the Better Auth session; a failure still continues to sign-in. */
  readonly signOut: () => Promise<void>;
  /** The page the person is on. */
  readonly currentUrl: () => URL;
  /** Loads a page outside the app's router state. */
  readonly assign: (path: string) => void;
}

/**
 * Sends the person to sign-in, once, when the API answers 401: their session ended, or
 * Planning Center no longer accepts their connection. The session is ended first, because the
 * sign-in page returns anyone still signed in straight to the app, where the same 401 would
 * repeat. Afterwards sign-in returns them to the page they were on. Any other failure stays
 * with the screen that asked.
 */
export const createSessionExpiryHandler = ({
  signOut,
  currentUrl,
  assign,
}: SessionExpiryDependencies): ((error: Error) => void) => {
  let leaving = false;
  return (error) => {
    if (leaving || failureStatus(error) !== UNAUTHENTICATED_STATUS) {
      return;
    }
    const url = currentUrl();
    if (url.pathname === "/auth") {
      return;
    }
    leaving = true;
    const destination = signInPath(url);
    void (async () => {
      try {
        await signOut();
      } catch {
        // Sign-in still opens; a session that outlived this is ended by the next 401.
      }
      assign(destination);
    })();
  };
};

/** The browser's handler, leaving things as a manual sign-out does; none on the server. */
export const browserSessionExpiry = ():
  | ((error: Error) => void)
  | undefined => {
  if (import.meta.env.SSR) {
    return undefined;
  }
  return createSessionExpiryHandler({
    signOut: async () => {
      resetAnalytics();
      clearAccountScopedCaches();
      await authClient.signOut();
    },
    currentUrl: () => new URL(window.location.href),
    assign: (path) => {
      window.location.assign(path);
    },
  });
};
