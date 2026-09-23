import { posthog } from "posthog-js";
import type { CaptureResult } from "posthog-js";
import { z } from "zod";

import {
  analyticsUrl,
  canInitializeAnalytics,
  prepareAnalyticsEvent,
} from "./privacy";

type AnalyticsEvent =
  | "marketing cta clicked"
  | "sign in started"
  | "sign in failed"
  | "app opened"
  | "workflow completed"
  | "workflow failed";
let initialized = false;
let currentUserId: string | undefined;

const beforeSend = (event: CaptureResult | null): CaptureResult | null =>
  prepareAnalyticsEvent(
    event,
    window.location.pathname,
    currentUserId !== undefined
  );

export const captureAnalytics = (
  event: AnalyticsEvent,
  properties: Record<string, string | number | boolean> = {}
): void => {
  if (!initialized) {
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
  try {
    currentUserId = userId;
    if (!initialized) {
      posthog.init(key, {
        api_host: "https://us.i.posthog.com",
        ui_host: "https://us.posthog.com",
        defaults: "2026-01-30",
        person_profiles: "identified_only",
        autocapture: false,
        capture_pageview: "history_change",
        capture_pageleave: true,
        disable_session_recording: true,
        disable_surveys: true,
        disable_conversations: true,
        disable_product_tours: true,
        disable_web_experiments: true,
        disable_external_dependency_loading: true,
        capture_heatmaps: false,
        capture_dead_clicks: false,
        capture_exceptions: false,
        capture_performance: false,
        rageclick: false,
        advanced_disable_flags: true,
        advanced_disable_feature_flags: true,
        enable_recording_console_log: false,
        respect_dnt: true,
        cross_subdomain_cookie: false,
        disable_capture_url_hashes: true,
        get_current_url: analyticsUrl,
        before_send: beforeSend,
        loaded: (client) => {
          if (userId !== undefined) {
            const previousUserId = z
              .string()
              .safeParse(client.get_property("$user_id"));
            if (previousUserId.success && previousUserId.data !== userId) {
              client.reset();
            }
            client.identify(userId);
          }
        },
      });
      initialized = true;
      if (userId !== undefined) {
        captureAnalytics("app opened");
      }
    } else if (userId !== undefined && posthog.get_distinct_id() !== userId) {
      const previousUserId = z
        .string()
        .safeParse(posthog.get_property("$user_id"));
      if (previousUserId.success && previousUserId.data !== userId) {
        posthog.reset();
      }
      posthog.identify(userId);
      captureAnalytics("app opened");
    }
  } catch {
    // SDK or browser-storage failures must not affect the product.
  }
};

export const resetAnalytics = (): void => {
  currentUserId = undefined;
  if (initialized) {
    try {
      posthog.reset();
    } catch {
      // Sign-out must work even when browser storage is unavailable.
    }
  }
};
