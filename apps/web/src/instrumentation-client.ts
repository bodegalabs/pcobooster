import { initializeAnalytics } from "@pcobooster/analytics/client";

// Product initialization waits for the account query to rule out read-only demo sessions.
if (window.location.pathname === "/auth") {
  initializeAnalytics(
    process.env.NEXT_PUBLIC_POSTHOG_KEY,
    process.env.NODE_ENV === "production"
  );
}
