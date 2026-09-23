import type { CaptureResult } from "posthog-js";
import { z } from "zod";

const PLAN_PATH =
  /^\/services\/[^/]+\/plans\/[^/]+(?:\/(?<view>assign|lineup|plan|times))?\/?$/u;
const PERSON_PATH = /^\/people\/[^/]+\/?$/u;
const PUBLIC_PATHS = new Set(["/", "/about", "/auth", "/services", "/people"]);

export const analyticsPath = (pathname: string): string => {
  const path = pathname.length > 1 ? pathname.replace(/\/$/u, "") : pathname;
  if (PUBLIC_PATHS.has(path)) {
    return path;
  }
  const plan = PLAN_PATH.exec(path);
  if (plan) {
    return `/services/:serviceTypeId/plans/:planId/${plan.groups?.view ?? "assign"}`;
  }
  if (PERSON_PATH.test(path)) {
    return "/people/:personId";
  }
  return "/other";
};

/** Neither private demo keys, entity IDs, search text, nor OAuth parameters leave the browser. */
export const analyticsUrl = (value: string): string => {
  try {
    const url = new URL(value);
    if (url.hostname !== "pcobooster.com") {
      return url.origin;
    }
    return `${url.origin}${analyticsPath(url.pathname)}`;
  } catch {
    return "";
  }
};

const SAFE_PROPERTIES = new Set([
  "token",
  "distinct_id",
  "$device_id",
  "$user_id",
  "$anon_distinct_id",
  "$session_id",
  "$window_id",
  "$pageview_id",
  "$lib",
  "$lib_version",
  "$insert_id",
  "$time",
  "$sent_at",
  "$is_identified",
  "$process_person_profile",
  "$browser",
  "$browser_version",
  "$os",
  "$os_version",
  "$device_type",
  "$screen_height",
  "$screen_width",
  "$viewport_height",
  "$viewport_width",
  "$referring_domain",
  "$initial_referring_domain",
  "$host",
  "$session_entry_referring_domain",
  "$session_duration",
  "$prev_pageview_duration",
  "$prev_pageview_last_scroll",
  "$prev_pageview_max_scroll",
  "$prev_pageview_last_scroll_percentage",
  "$prev_pageview_max_scroll_percentage",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "$initial_utm_source",
  "$initial_utm_medium",
  "$initial_utm_campaign",
  "surface",
  "is_authenticated",
  "operation",
  "outcome",
  "error_code",
  "duration_ms",
  "cta_location",
]);
const URL_PROPERTIES = new Set([
  "$current_url",
  "$initial_current_url",
  "$referrer",
  "$initial_referrer",
  "$session_entry_url",
  "$prev_pageview_url",
]);
const PATH_PROPERTIES = new Set([
  "$pathname",
  "$initial_pathname",
  "$prev_pageview_pathname",
]);

const propertyBagSchema = z.record(z.string(), z.unknown());
const stringPropertySchema = z.string();
const scalarPropertySchema = z.union([z.string(), z.number(), z.boolean()]);
interface AnalyticsProperties {
  [key: string]: string | number | boolean | AnalyticsProperties;
}

/** A closed schema also covers SDK-generated person and session properties. */
export const sanitizeAnalyticsProperties = (
  properties: z.infer<typeof propertyBagSchema>
): AnalyticsProperties => {
  const parsed = propertyBagSchema.safeParse(properties);
  const result: AnalyticsProperties = {};
  if (!parsed.success) {
    return result;
  }
  for (const [key, value] of Object.entries(parsed.data)) {
    const stringValue = stringPropertySchema.safeParse(value);
    const scalarValue = scalarPropertySchema.safeParse(value);
    if (URL_PROPERTIES.has(key) && stringValue.success) {
      result[key] = analyticsUrl(stringValue.data);
    } else if (PATH_PROPERTIES.has(key) && stringValue.success) {
      result[key] = analyticsPath(stringValue.data);
    } else if (key === "$set" || key === "$set_once") {
      const nested = propertyBagSchema.safeParse(value);
      if (nested.success) {
        result[key] = sanitizeAnalyticsProperties(nested.data);
      }
    } else if (SAFE_PROPERTIES.has(key) && scalarValue.success) {
      result[key] = scalarValue.data;
    }
  }
  return result;
};

export const analyticsSurface = (
  pathname: string
): "marketing" | "auth" | "app" => {
  if (pathname === "/" || pathname === "/about" || pathname === "/about/") {
    return "marketing";
  }
  return pathname === "/auth" ? "auth" : "app";
};

export const canInitializeAnalytics = (
  key: string | undefined,
  hostname: string,
  production: boolean
): boolean => production && Boolean(key) && hostname === "pcobooster.com";

const EVENTS = new Set([
  "$pageview",
  "$pageleave",
  "$identify",
  "marketing cta clicked",
  "sign in started",
  "sign in failed",
  "app opened",
  "workflow completed",
  "workflow failed",
]);

export const canRecordSession = (
  pathname: string,
  authenticated: boolean
): boolean =>
  authenticated &&
  (pathname === "/services" ||
    pathname === "/people" ||
    PLAN_PATH.test(pathname) ||
    PERSON_PATH.test(pathname));

export const prepareAnalyticsEvent = (
  event: CaptureResult | null,
  pathname: string,
  authenticated: boolean
): CaptureResult | null => {
  if (event?.event === "$snapshot") {
    if (!canRecordSession(pathname, authenticated)) {
      return null;
    }
    const snapshots = z
      .array(z.unknown())
      .safeParse(event.properties.$snapshot_data);
    if (!snapshots.success) {
      return null;
    }
    return {
      uuid: event.uuid,
      event: event.event,
      timestamp: event.timestamp,
      properties: {
        ...sanitizeAnalyticsProperties(event.properties),
        // rrweb masks DOM content before producing these replay frames.
        $snapshot_data: snapshots.data,
        $snapshot_bytes: z.number().safeParse(event.properties.$snapshot_bytes)
          .data,
      },
    };
  }
  if (
    event === null ||
    !EVENTS.has(event.event) ||
    pathname.startsWith("/demo/")
  ) {
    return null;
  }
  const surface = analyticsSurface(pathname);
  if (surface === "app" && !authenticated) {
    return null;
  }
  return {
    uuid: event.uuid,
    event: event.event,
    timestamp: event.timestamp,
    properties: sanitizeAnalyticsProperties({
      ...event.properties,
      surface,
      is_authenticated: authenticated,
    }),
    // The SDK puts initial attribution outside properties when creating a person.
    $set:
      event.$set === undefined
        ? undefined
        : sanitizeAnalyticsProperties(event.$set),
    $set_once:
      event.$set_once === undefined
        ? undefined
        : sanitizeAnalyticsProperties(event.$set_once),
  };
};
