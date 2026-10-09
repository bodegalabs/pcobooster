import { Schema } from "effect";
import type { CaptureResult, PostHog } from "posthog-js";

import {
  analyticsUrl,
  canInitializeAnalytics,
  canRecordSession,
  canReportException,
  prepareAnalyticsEvent,
} from "./privacy";
import { replayOptions } from "./replay";

const isString = Schema.is(Schema.String);

type AnalyticsEvent =
  | "marketing cta clicked"
  | "sign in started"
  | "sign in failed"
  | "app opened"
  | "workflow completed"
  | "workflow failed";
/**
 * The SDK once it is initialized. It is imported only when analytics starts, so pages that never
 * initialize (most of the product until the account answers) never download or run it.
 */
let posthog: PostHog | undefined;
let loadingSdk: Promise<PostHog> | undefined;
let currentUserId: string | undefined;
/** Raised by `resetAnalytics`, so an initialization still loading the SDK identifies nobody. */
let generation = 0;

const importSdk = async (): Promise<PostHog> => {
  const module = await import("posthog-js");
  return module.posthog;
};

const loadSdk = async (): Promise<PostHog> => {
  loadingSdk ??= importSdk();
  return await loadingSdk;
};

/** Replay retains its own route gate; errors cover every authenticated product route. */
const syncSessionRecording = (sdk: PostHog): void => {
  if (canRecordSession(window.location.pathname, currentUserId !== undefined)) {
    // Respect the project's sampling and minimum-duration controls.
    sdk.startSessionRecording();
  } else {
    sdk.stopSessionRecording();
  }
  if (
    canReportException(window.location.pathname, currentUserId !== undefined)
  ) {
    sdk.startExceptionAutocapture({
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    });
  } else {
    sdk.stopExceptionAutocapture();
  }
};

const beforeSend = (event: CaptureResult | null): CaptureResult | null => {
  if (posthog !== undefined && event?.event === "$pageview") {
    // Also stop capture on same-document navigation outside product routes.
    syncSessionRecording(posthog);
  }
  return prepareAnalyticsEvent(
    event,
    window.location.pathname,
    currentUserId !== undefined
  );
};

export const captureAnalytics = (
  event: AnalyticsEvent,
  properties: Record<string, string | number | boolean> = {}
): void => {
  if (posthog === undefined) {
    return;
  }
  try {
    posthog.capture(
      event,
      properties,
      event === "marketing cta clicked" || event === "sign in started"
        ? { transport: "sendBeacon", send_instantly: true }
        : undefined
    );
  } catch {
    // Event delivery is best effort.
  }
};

/** Initializes the SDK once, or identifies a different person on a later call. */
const startSdk = (
  sdk: PostHog,
  key: string,
  productDocument: boolean,
  userId: string | undefined
): void => {
  if (posthog === undefined) {
    sdk.init(key, {
      api_host: "https://us.i.posthog.com",
      ui_host: "https://us.posthog.com",
      defaults: "2026-01-30",
      person_profiles: "identified_only",
      autocapture: false,
      capture_pageview: "history_change",
      capture_pageleave: true,
      disable_session_recording: true,
      session_recording: replayOptions,
      disable_surveys: true,
      disable_conversations: true,
      disable_product_tours: true,
      disable_web_experiments: true,
      disable_external_dependency_loading: !productDocument,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      capture_exceptions: false,
      capture_performance: false,
      rageclick: false,
      // Replay needs remote configuration; feature flag evaluation stays disabled.
      advanced_disable_flags: !productDocument,
      advanced_disable_feature_flags: true,
      enable_recording_console_log: false,
      respect_dnt: true,
      cross_subdomain_cookie: false,
      disable_capture_url_hashes: true,
      get_current_url: analyticsUrl,
      before_send: beforeSend,
      loaded: (client) => {
        if (userId !== undefined) {
          const previousUserId: unknown = client.get_property("$user_id");
          if (isString(previousUserId) && previousUserId !== userId) {
            client.reset();
          }
          client.identify(userId);
        }
      },
    });
    posthog = sdk;
    if (userId !== undefined) {
      captureAnalytics("app opened");
    }
  } else if (userId !== undefined && sdk.get_distinct_id() !== userId) {
    const previousUserId: unknown = sdk.get_property("$user_id");
    if (isString(previousUserId) && previousUserId !== userId) {
      sdk.reset();
    }
    sdk.identify(userId);
    captureAnalytics("app opened");
  }
};

/** Analytics must never prevent sign-in, navigation, or a successful provider write. */
export const initializeAnalytics = (
  key: string | undefined,
  production: boolean,
  userId?: string
): void => {
  if (
    typeof window === "undefined" ||
    !canInitializeAnalytics(key, window.location.hostname, production) ||
    key === undefined ||
    key === ""
  ) {
    return;
  }
  const productDocument =
    window.location.pathname === "/auth" ||
    canReportException(window.location.pathname, true);
  currentUserId = userId;
  const startedIn = generation;
  void (async () => {
    try {
      const sdk = await loadSdk();
      if (startedIn !== generation) {
        return;
      }
      startSdk(sdk, key, productDocument, userId);
      syncSessionRecording(sdk);
    } catch {
      // SDK, network, or browser-storage failures must not affect the product.
    }
  })();
};

/**
 * Reports an error React caught in an error boundary, which never reaches the global
 * handlers that exception autocapture listens to. The privacy guard drops it outside
 * authenticated product routes.
 */
export const captureAnalyticsException = (
  error: Error,
  properties: Record<string, string | number | boolean> = {}
): void => {
  if (posthog === undefined) {
    return;
  }
  try {
    posthog.captureException(error, properties);
  } catch {
    // Error reporting is best effort.
  }
};

/** Lets server-side events, such as feedback, link to this session's replay. */
export const getAnalyticsSessionId = (): string | null => {
  if (posthog === undefined) {
    return null;
  }
  try {
    return posthog.get_session_id() || null;
  } catch {
    return null;
  }
};

export const resetAnalytics = (): void => {
  currentUserId = undefined;
  generation += 1;
  if (posthog !== undefined) {
    try {
      posthog.stopSessionRecording();
      posthog.stopExceptionAutocapture();
      posthog.reset();
    } catch {
      // Sign-out must work even when browser storage is unavailable.
    }
  }
};
