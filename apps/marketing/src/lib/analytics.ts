import {
  captureAnalytics,
  initializeAnalytics,
} from "@pcobooster/analytics/client";

const recordCtaClick = (event: MouseEvent): void => {
  const link =
    event.target instanceof Element
      ? event.target.closest("a[data-analytics-cta]")
      : null;
  if (link instanceof HTMLAnchorElement) {
    captureAnalytics("marketing cta clicked", {
      cta_location: link.dataset.analyticsCta ?? "unknown",
    });
  }
};

/** Runs once per document, before hydration; product links are full document navigations. */
export const startMarketingAnalytics = (): void => {
  initializeAnalytics(import.meta.env.VITE_POSTHOG_KEY, import.meta.env.PROD);
  document.addEventListener("click", recordCtaClick);
};
