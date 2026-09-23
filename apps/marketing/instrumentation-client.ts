import {
  captureAnalytics,
  initializeAnalytics,
} from "@pcobooster/analytics/client";

initializeAnalytics(
  process.env.NEXT_PUBLIC_POSTHOG_KEY,
  process.env.NODE_ENV === "production"
);

document.addEventListener("click", (event) => {
  const link =
    event.target instanceof Element
      ? event.target.closest("a[data-analytics-cta]")
      : null;
  if (link instanceof HTMLAnchorElement) {
    captureAnalytics("marketing cta clicked", {
      cta_location: link.dataset.analyticsCta ?? "unknown",
    });
  }
});
