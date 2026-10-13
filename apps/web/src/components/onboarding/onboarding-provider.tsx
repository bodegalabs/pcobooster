import { useHydrated, useLocation, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { createContext, use, useCallback, useMemo, useState } from "react";

import { useAccessReview } from "@/components/access/access-review";
import { GuidedTour } from "@/components/onboarding/guided-tour";
import {
  appTourSteps,
  planTourSteps,
} from "@/components/onboarding/tour-steps";
import { WelcomeDialog } from "@/components/onboarding/welcome-dialog";
import { useSidebar } from "@/components/ui/sidebar";
import { useAccountsQuery } from "@/hooks/use-account-panel";
import { useBrowserStorage } from "@/hooks/use-browser-storage";
import { usePlanRoute } from "@/hooks/use-plan-route";
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
  /** Walks through the app on Services, pointing at each part in turn. */
  readonly startAppTour: () => void;
  /** Walks through the open plan's views again; it runs on its own the first time. */
  readonly startPlanTour: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue>({
  openWelcome: () => {
    // Outside the app shell there is no guide to open.
  },
  startAppTour: () => {
    // Outside the app shell there is no tour to start.
  },
  startPlanTour: () => {
    // Outside the app shell there is no tour to start.
  },
});

export const useOnboarding = (): OnboardingContextValue =>
  use(OnboardingContext);

/**
 * Whose progress the guides record, and whether one may open now: never before the page
 * hydrates, during presentation mode (screenshots and projector demos), or while the access
 * review is still deciding whether to open. `null` until a guide may open.
 */
const useGuideAccount = (): { account: string; demo: boolean } | null => {
  const hydrated = useHydrated();
  const { data: accounts } = useAccountsQuery();
  const { reviewOpen, accessSettled, noServicesAccess } = useAccessReview();
  const demo = accounts?.demo === true;
  const account = demo
    ? DEMO_ONBOARDING_ACCOUNT
    : (accounts?.selectedAccountId ?? null);
  const ready =
    hydrated &&
    !presentationMode &&
    accessSettled &&
    !reviewOpen &&
    !noServicesAccess;
  return ready && account !== null ? { account, demo } : null;
};

/**
 * First-run guides for the signed-in app. The welcome opens once per account, after the
 * access review has had its turn, so a new person never gets two dialogs at once. It
 * sits inside the sidebar provider so the tour can open the sidebar it points at.
 */
export const OnboardingProvider = ({ children }: { children: ReactNode }) => {
  const guide = useGuideAccount();
  const [progressRaw, setProgressRaw] = useBrowserStorage(
    ONBOARDING_PROGRESS_KEY
  );
  const [welcomeRequested, setWelcomeRequested] = useState(false);
  const [appTourActive, setAppTourActive] = useState(false);
  const [planTourRequested, setPlanTourRequested] = useState(false);
  const planRoute = usePlanRoute();
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const { isMobile, setOpen: setSidebarOpen } = useSidebar();

  const account = guide?.account ?? null;
  const prompted =
    account !== null && !hasSeenGuide(progressRaw, account, "welcome");
  const welcomeOpen = welcomeRequested || prompted;
  // The first plan someone opens walks them through its views, once the welcome is done.
  const planTourPrompted =
    account !== null &&
    !welcomeOpen &&
    !appTourActive &&
    !hasSeenGuide(progressRaw, account, "plan-tour");
  const planTourActive =
    planRoute !== null && (planTourRequested || planTourPrompted);

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

  const startAppTour = useCallback(() => {
    handleWelcomeOpenChange(false);
    if (!isMobile) {
      setSidebarOpen(true);
    }
    void navigate({ to: "/services" });
    setAppTourActive(true);
  }, [handleWelcomeOpenChange, isMobile, navigate, setSidebarOpen]);

  const finishAppTour = useCallback(() => {
    setAppTourActive(false);
  }, []);

  const startPlanTour = useCallback(() => {
    setPlanTourRequested(true);
  }, []);

  const finishPlanTour = useCallback(() => {
    setPlanTourRequested(false);
    if (account !== null) {
      setProgressRaw(recordGuideSeen(progressRaw, account, "plan-tour"));
    }
  }, [account, progressRaw, setProgressRaw]);

  const value = useMemo(
    () => ({ openWelcome, startAppTour, startPlanTour }),
    [openWelcome, startAppTour, startPlanTour]
  );

  return (
    <OnboardingContext value={value}>
      {children}
      <WelcomeDialog
        open={welcomeOpen}
        onOpenChange={handleWelcomeOpenChange}
        onStartTour={startAppTour}
        demo={guide?.demo === true}
      />
      {/* The tour starts once Services is on screen; its steps point at that page. */}
      {appTourActive && pathname === "/services" ? (
        <GuidedTour steps={appTourSteps} onFinish={finishAppTour} />
      ) : null}
      {planTourActive && !appTourActive ? (
        // Keyed by plan so stepping to another plan mid-tour starts it fresh there.
        <GuidedTour
          key={planRoute.planId}
          steps={planTourSteps}
          onFinish={finishPlanTour}
        />
      ) : null}
    </OnboardingContext>
  );
};
