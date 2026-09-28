import {
  captureAnalyticsException,
  initializeAnalytics,
} from "@pcobooster/analytics/client";
import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";

// Start's default client entry, preceded by sign-in analytics. Product pages initialize after
// a successful account response instead, which rules out read-only demo sessions
// (`hooks/use-account-panel.ts`).
if (window.location.pathname === "/auth") {
  initializeAnalytics(import.meta.env.VITE_POSTHOG_KEY, import.meta.env.PROD);
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
    {
      // Errors an error boundary catches never reach the global handlers that exception
      // autocapture listens to. Uncaught ones do, so React's default handles those.
      onCaughtError: (error, errorInfo) => {
        console.error(error, errorInfo.componentStack);
        captureAnalyticsException(
          error instanceof Error ? error : new Error(String(error))
        );
      },
    }
  );
});
