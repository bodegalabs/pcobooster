import { Option, Schema } from "effect";
import type { CaptureResult } from "posthog-js";

const PLAN_PATH =
  /^\/services\/[^/]+\/plans\/[^/]+(?:\/(?<view>assign|lineup|plan|times))?\/?$/u;
const OVERVIEW_PATH = /^\/services\/[^/]+\/plans\/[^/]+\/overview\/?$/u;
const SONG_PATH = /^\/songs\/[^/]+\/?$/u;
const PERSON_PATH = /^\/people\/[^/]+\/?$/u;
const PUBLIC_PATHS = new Set([
  "/",
  "/about",
  "/auth",
  "/services",
  "/people",
  "/songs",
]);

export const analyticsPath = (pathname: string): string => {
  const path = pathname.length > 1 ? pathname.replace(/\/$/u, "") : pathname;
  if (PUBLIC_PATHS.has(path)) {
    return path;
  }
  const plan = PLAN_PATH.exec(path);
  if (plan) {
    return `/services/:serviceTypeId/plans/:planId/${plan.groups?.view ?? "assign"}`;
  }
  if (OVERVIEW_PATH.test(path)) {
    return "/services/:serviceTypeId/plans/:planId/overview";
  }
  if (SONG_PATH.test(path)) {
    return "/songs/:songId";
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

/** Scalar event properties that leave the browser unchanged. */
export const safeAnalyticsProperties = [
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
  "$exception_level",
] as const;
const SAFE_PROPERTIES = new Set<string>(safeAnalyticsProperties);
const URL_PROPERTIES = new Set([
  "$current_url",
  "$initial_current_url",
  "$referrer",
  "$initial_referrer",
  "$session_entry_url",
  "$prev_pageview_url",
]);
/** Path properties that leave the browser as route templates. */
export const pathAnalyticsProperties = [
  "$pathname",
  "$initial_pathname",
  "$prev_pageview_pathname",
] as const;
const PATH_PROPERTIES = new Set<string>(pathAnalyticsProperties);

/** Event property keys that saved reports may filter or break down by. */
export type AnalyticsProperty =
  | (typeof safeAnalyticsProperties)[number]
  | (typeof pathAnalyticsProperties)[number];

const propertyBagSchema = Schema.Record(Schema.String, Schema.Unknown);
const isPropertyBag = Schema.is(propertyBagSchema);
const isStringProperty = Schema.is(Schema.String);
const isScalarProperty = Schema.is(
  Schema.Union([Schema.String, Schema.Finite, Schema.Boolean])
);
interface AnalyticsProperties {
  [key: string]: string | number | boolean | AnalyticsProperties;
}

/** A closed schema also covers SDK-generated person and session properties. */
export const sanitizeAnalyticsProperties = (
  properties: typeof propertyBagSchema.Type
): AnalyticsProperties => {
  const result: AnalyticsProperties = {};
  if (!isPropertyBag(properties)) {
    return result;
  }
  for (const [key, value] of Object.entries(properties)) {
    if (URL_PROPERTIES.has(key) && isStringProperty(value)) {
      result[key] = analyticsUrl(value);
    } else if (PATH_PROPERTIES.has(key) && isStringProperty(value)) {
      result[key] = analyticsPath(value);
    } else if (key === "$set" || key === "$set_once") {
      if (isPropertyBag(value)) {
        result[key] = sanitizeAnalyticsProperties(value);
      }
    } else if (SAFE_PROPERTIES.has(key) && isScalarProperty(value)) {
      result[key] = value;
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

/** The only events the browser sends. */
export const analyticsEvents = [
  "$exception",
  "$pageview",
  "$pageleave",
  "$identify",
  "marketing cta clicked",
  "sign in started",
  "sign in failed",
  "app opened",
  "workflow completed",
  "workflow failed",
] as const;
export type AnalyticsEvent = (typeof analyticsEvents)[number];
const EVENTS = new Set<string>(analyticsEvents);

export const canRecordSession = (
  pathname: string,
  authenticated: boolean
): boolean =>
  authenticated &&
  (pathname === "/services" ||
    pathname === "/people" ||
    PLAN_PATH.test(pathname) ||
    PERSON_PATH.test(pathname));

/** Error reporting covers every authenticated product surface without expanding replay. */
export const canReportException = (
  pathname: string,
  authenticated: boolean
): boolean =>
  authenticated && /^\/(?:services|people|songs)(?:\/|$)/u.test(pathname);

const EXCEPTION_MESSAGE_MAX_LENGTH = 500;
const exceptionFrameSchema = Schema.Struct({
  platform: Schema.optional(Schema.String),
  filename: Schema.optional(Schema.String),
  function: Schema.optional(Schema.String),
  lineno: Schema.optional(Schema.Finite),
  colno: Schema.optional(Schema.Finite),
  in_app: Schema.optional(Schema.Boolean),
});
const exceptionListSchema = Schema.Array(
  Schema.Struct({
    type: Schema.optional(Schema.String),
    value: Schema.optional(Schema.String),
    mechanism: Schema.optional(
      Schema.Struct({
        handled: Schema.optional(Schema.Boolean),
        synthetic: Schema.optional(Schema.Boolean),
        type: Schema.optional(Schema.String),
      })
    ),
    stacktrace: Schema.optional(
      Schema.Struct({
        type: Schema.String,
        frames: Schema.Array(exceptionFrameSchema),
      })
    ),
  })
);
const isFiniteNumber = Schema.is(Schema.Finite);
const decodeExceptionList = Schema.decodeUnknownOption(exceptionListSchema);

/** Bundled script URLs stay intact so stack frames resolve; other URLs are scrubbed. */
const exceptionFrameFilename = (filename: string): string => {
  try {
    const url = new URL(filename);
    return url.hostname === "pcobooster.com" &&
      url.pathname.startsWith("/assets/")
      ? `${url.origin}${url.pathname}`
      : analyticsUrl(filename);
  } catch {
    return "";
  }
};

/**
 * Keeps an exception's type, message, and stack frames. Messages come from code, not from
 * people, but are truncated in case one embeds a payload.
 */
export const sanitizeExceptionList = (
  properties: CaptureResult["properties"]
): typeof exceptionListSchema.Type => {
  const parsed = decodeExceptionList(properties.$exception_list);
  if (Option.isNone(parsed)) {
    return [];
  }
  return parsed.value.map((exception) => ({
    ...exception,
    value: exception.value?.slice(0, EXCEPTION_MESSAGE_MAX_LENGTH),
    stacktrace:
      exception.stacktrace === undefined
        ? undefined
        : {
            type: exception.stacktrace.type,
            frames: exception.stacktrace.frames.map((frame) => ({
              ...frame,
              filename:
                frame.filename === undefined
                  ? undefined
                  : exceptionFrameFilename(frame.filename),
            })),
          },
  }));
};

export const prepareAnalyticsEvent = (
  event: CaptureResult | null,
  pathname: string,
  authenticated: boolean
): CaptureResult | null => {
  if (event?.event === "$snapshot") {
    if (!canRecordSession(pathname, authenticated)) {
      return null;
    }
    const snapshots: unknown = event.properties.$snapshot_data;
    if (!Array.isArray(snapshots)) {
      return null;
    }
    const bytes: unknown = event.properties.$snapshot_bytes;
    return {
      uuid: event.uuid,
      event: event.event,
      timestamp: event.timestamp,
      properties: {
        ...sanitizeAnalyticsProperties(event.properties),
        // rrweb masks DOM content before producing these replay frames.
        $snapshot_data: snapshots,
        $snapshot_bytes: isFiniteNumber(bytes) ? bytes : undefined,
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
  if (event.event === "$exception") {
    // Exception capture covers all authenticated product routes; replay has its own gate.
    const exceptionList = sanitizeExceptionList(event.properties);
    if (
      !canReportException(pathname, authenticated) ||
      exceptionList.length === 0
    ) {
      return null;
    }
    return {
      uuid: event.uuid,
      event: event.event,
      timestamp: event.timestamp,
      properties: {
        ...sanitizeAnalyticsProperties({
          ...event.properties,
          surface,
          is_authenticated: authenticated,
        }),
        $exception_list: exceptionList,
      },
    };
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
