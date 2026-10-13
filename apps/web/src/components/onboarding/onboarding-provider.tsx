import { useHydrated } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { createContext, use, useCallback, useMemo, useState } from "react";

import { useAccessReview } from "@/components/access/access-review";
import { WelcomeDialog } from "@/components/onboarding/welcome-dialog";
import { useAccountsQuery } from "@/hooks/use-account-panel";
import { useBrowserStorage } from "@/hooks/use-browser-storage";
import { presentationMode } from "@/lib/build-settings";
import {
  DEMO_ONBOARDING_ACCOUNT,
  ONBOARDING_PROGRESS_KEY,
  hasSeenGuide,
  recordGuideSeen,
} from "@/lib/onboarding";

interface OnboardingContextValue {
  /** Opens the welcome guide again, from the account menu. */
  readonly openWelcome: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue>({
  openWelcome: () => {
    // Outside the app shell there is no guide to open.
  },
});

export const useOnboarding = (): OnboardingContextValue =>
  use(OnboardingContext);

/**
 * First-run guides for the signed-in app. The welcome opens once per account, after the
 * access review has had its turn, so a new person never gets two dialogs at once.
 */
export const OnboardingProvider = ({ children }: { children: ReactNode }) => {
  const hydrated = useHydrated();
  const { data: accounts } = useAccountsQuery();
  const { reviewOpen, accessSettled, noServicesAccess } = useAccessReview();
  const [progressRaw, setProgressRaw] = useBrowserStorage(
    ONBOARDING_PROGRESS_KEY
  );
  const [welcomeRequested, setWelcomeRequested] = useState(false);

  const demo = accounts?.demo === true;
  const account = demo
    ? DEMO_ONBOARDING_ACCOUNT
    : (accounts?.selectedAccountId ?? null);
  // Presentation mode is for screenshots and demos on a projector; guides would cover them.
  const prompted =
    hydrated &&
    !presentationMode &&
    account !== null &&
    accessSettled &&
    !reviewOpen &&
    !noServicesAccess &&
    !hasSeenGuide(progressRaw, account, "welcome");
  const welcomeOpen = welcomeRequested || prompted;

  const handleWelcomeOpenChange = useCallback(
    (open: boolean) => {
      setWelcomeRequested(open);
      if (!open && account !== null) {
        setProgressRaw(recordGuideSeen(progressRaw, account, "welcome"));
      }
    },
    [account, progressRaw, setProgressRaw]
  );

  const openWelcome = useCallback(() => {
    setWelcomeRequested(true);
  }, []);

  const value = useMemo(() => ({ openWelcome }), [openWelcome]);

  return (
    <OnboardingContext value={value}>
      {children}
      <WelcomeDialog
        open={welcomeOpen}
        onOpenChange={handleWelcomeOpenChange}
        demo={demo}
      />
    </OnboardingContext>
  );
};
