import type { Procedure } from "@pcobooster/client/rpc";
import { applicationErrorMap } from "@pcobooster/contracts/errors";
import type { ApplicationErrorCode } from "@pcobooster/contracts/errors";
import { ProductRpc } from "@pcobooster/contracts/router";
import { Schema } from "effect";

const eventSchema = Schema.Literals([
  "app_opened",
  "sign_in_started",
  "sign_in_failed",
  "workflow_completed",
  "workflow_failed",
]);
const operationSchema = Schema.Literals([
  ...ProductRpc.requests.keys(),
  "sign_in",
  "sign_out",
]);
const extraErrorCodes = [
  "UNKNOWN",
  "NETWORK_ERROR",
  "SIGN_IN_CANCELLED",
  "SIGN_IN_FAILED",
] as const;
const errorCodeSchema = Schema.Literals([
  ...Object.keys(applicationErrorMap),
  ...extraErrorCodes,
]);

export type NativeAnalyticsEvent = typeof eventSchema.Type;
export type NativeAnalyticsOperation = Procedure | "sign_in" | "sign_out";
export type NativeAnalyticsErrorCode =
  | ApplicationErrorCode
  | (typeof extraErrorCodes)[number];

export interface NativeAnalyticsProperties {
  operation?: NativeAnalyticsOperation;
  errorCode?: NativeAnalyticsErrorCode;
}

export interface NativeAnalyticsOptions {
  key: string | null | undefined;
  enabled: () => boolean;
  /** Supply an opaque installation ID or an opted-in user ID, never an email or demo token. */
  distinctId: () => string;
  fetch?: typeof globalThis.fetch;
  host?: string;
}

interface EventProperties {
  distinct_id: string;
  $process_person_profile: false;
  operation?: string;
  error_code?: string;
}

/** Opt-in events only. No SDK, automatic capture, entity payloads, or person profiles. */
export const createNativeAnalytics = (options: NativeAnalyticsOptions) => ({
  capture: async (
    event: NativeAnalyticsEvent,
    attributes: NativeAnalyticsProperties = {}
  ): Promise<void> => {
    const key = options.key?.trim();
    if (
      key === undefined ||
      key === "" ||
      !options.enabled() ||
      !Schema.is(eventSchema)(event)
    ) {
      return;
    }
    const distinctId = options.distinctId();
    if (!distinctId.trim()) {
      return;
    }
    const properties: EventProperties = {
      distinct_id: distinctId,
      $process_person_profile: false,
    };
    // Pick individual validated values; spreading callers' objects could expose workflow data.
    if (Schema.is(operationSchema)(attributes.operation)) {
      properties.operation = attributes.operation;
    }
    if (Schema.is(errorCodeSchema)(attributes.errorCode)) {
      properties.error_code = attributes.errorCode;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, 5000);
    try {
      await (options.fetch ?? globalThis.fetch)(
        new URL("/i/v0/e/", options.host ?? "https://us.i.posthog.com"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: key, event, properties }),
          signal: controller.signal,
        }
      );
    } catch {
      // Telemetry loss stays local: no alert, retry, log, or recursive error capture.
    } finally {
      clearTimeout(timer);
    }
  },
});
