import { ORPCError } from "@orpc/client";
import type { captureAnalytics } from "@pcobooster/analytics/client";
import { z } from "zod";

const OPERATIONS = new Set([
  "schedule.assign",
  "schedule.remove",
  "schedule.updateStatus",
  "planItems.create",
  "planItems.update",
  "planItems.delete",
  "planItems.reorder",
  "planTimes.create",
  "planTimes.update",
  "planTimes.delete",
  "accounts.select",
]);
const errorCodeSchema = z.enum([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "BAD_REQUEST",
  "ALREADY_SCHEDULED",
  "POSITION_MISMATCH",
  "TOO_MANY_REQUESTS",
  "BAD_GATEWAY",
  "INTERNAL_SERVER_ERROR",
]);

/** Only operation names and outcomes are captured, never request/response bodies or error messages. */
export const measureWorkflow = async <T>(
  path: readonly string[],
  execute: () => Promise<T>,
  capture: typeof captureAnalytics
): Promise<T> => {
  const operation = path.join(".");
  if (!OPERATIONS.has(operation)) {
    return await execute();
  }
  const start = performance.now();
  try {
    const result = await execute();
    capture("workflow completed", {
      operation,
      duration_ms: Math.round(performance.now() - start),
    });
    return result;
  } catch (error) {
    const errorCode = errorCodeSchema.safeParse(
      error instanceof ORPCError ? error.code : undefined
    );
    if (!(error instanceof Error && error.name === "AbortError")) {
      capture("workflow failed", {
        operation,
        error_code: errorCode.success ? errorCode.data : "UNKNOWN",
      });
    }
    throw error;
  }
};
