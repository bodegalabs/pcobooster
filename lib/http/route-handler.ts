import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ApiError } from "@/lib/http/api-error";
import { elapsedMs, setRouteTimingHeaders, nowMs } from "@/lib/http/timing";
import { logger } from "@/lib/logger";
import { PlanningCenterApiError } from "@/lib/planning-center/core-client";
import { isPresentationMode } from "@/lib/presentation-mode";

const log = logger.for("http/route-handler");

export async function handleRoute<T>(handler: () => Promise<T>) {
  const startedAtMs = nowMs();

  try {
    const data = await handler();
    if (data instanceof Response) {
      return withRouteTiming(data, startedAtMs);
    }
    return withRouteTiming(NextResponse.json(data), startedAtMs);
  } catch (error) {
    if (error instanceof ApiError) {
      log.warn(
        { err: error, code: error.code, status: error.status },
        "API route error"
      );
      return jsonWithRouteTiming(
        startedAtMs,
        {
          error: error.message,
          code: error.code,
          details: isPresentationMode() ? undefined : error.details,
        },
        { status: error.status }
      );
    }

    if (error instanceof ZodError) {
      log.warn({ err: error }, "API route validation error");
      return jsonWithRouteTiming(
        startedAtMs,
        {
          error: "Invalid request",
          code: "INVALID_REQUEST",
          details: isPresentationMode() ? undefined : error.issues,
        },
        { status: 400 }
      );
    }

    if (error instanceof PlanningCenterApiError) {
      const code =
        error.status === 429
          ? "PLANNING_CENTER_RATE_LIMITED"
          : "PLANNING_CENTER_API_ERROR";
      const message =
        error.status === 429
          ? "Planning Center rate limit exceeded. Please wait and try again."
          : "Planning Center request failed.";
      const retryAfterSeconds = error.retryAfterSeconds;
      const headers = retryAfterSeconds
        ? { "Retry-After": String(retryAfterSeconds) }
        : undefined;

      log.warn(
        {
          err: error,
          status: error.status,
          code,
          rateLimit: error.rateLimit,
        },
        "Planning Center route error"
      );

      return jsonWithRouteTiming(
        startedAtMs,
        {
          error: message,
          code,
          details: isPresentationMode() ? undefined : error.details,
          retryAfterSeconds,
          rateLimit: error.rateLimit,
        },
        { status: error.status, headers }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    log.error(
      { err: error instanceof Error ? error : new Error(String(error)) },
      "Unhandled route error"
    );
    return jsonWithRouteTiming(
      startedAtMs,
      {
        error: "Internal server error",
        code: "INTERNAL_SERVER_ERROR",
        details: isPresentationMode() ? undefined : message,
      },
      { status: 500 }
    );
  }
}

function jsonWithRouteTiming(
  startedAtMs: number,
  body: unknown,
  init?: ResponseInit
) {
  return withRouteTiming(NextResponse.json(body, init), startedAtMs);
}

function withRouteTiming(response: Response, startedAtMs: number): Response {
  const durationMs = elapsedMs(startedAtMs);

  try {
    setRouteTimingHeaders(response.headers, durationMs);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    setRouteTimingHeaders(headers, durationMs);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}
