import { ORPCError } from "@orpc/server";
import {
  createPostHogExceptionReporter,
  isReportableRequestError,
  requestErrorSchema,
  toPostHogExceptionCapture,
} from "@pcobooster/api/modules/analytics/posthog-exception";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

const NOW = new Date("2026-09-28T17:00:00.000Z");
const request = {
  path: "/api/rpc/planItems/create",
  method: "POST",
  requestId: "request-1",
};

const planningCenterFailure = (): ORPCError<string, unknown> => {
  const cause = new Error("Planning Center responded 503");
  cause.stack = [
    "Error: Planning Center responded 503",
    "    at createPlanItem (index.js:10:5)",
    "    at async run (index.js:20:7)",
  ].join("\n");
  return new ORPCError("BAD_GATEWAY", { cause });
};

describe(isReportableRequestError, () => {
  it("reports server failures and defects, not expected client faults", () => {
    expect(isReportableRequestError(planningCenterFailure())).toBeTruthy();
    expect(isReportableRequestError(new Error("defect"))).toBeTruthy();
    for (const code of [
      "UNAUTHORIZED",
      "FORBIDDEN",
      "BAD_REQUEST",
      "NOT_FOUND",
      "CONFLICT",
      "TOO_MANY_REQUESTS",
      "CLIENT_CLOSED_REQUEST",
    ]) {
      expect(isReportableRequestError(new ORPCError(code))).toBeFalsy();
    }
  });
});

describe(toPostHogExceptionCapture, () => {
  it("describes the root cause and groups by procedure and error code", () => {
    expect(
      toPostHogExceptionCapture(
        "key",
        { ...request, error: planningCenterFailure() },
        NOW
      )
    ).toStrictEqual({
      api_key: "key",
      event: "$exception",
      distinct_id: "pcobooster-api",
      timestamp: "2026-09-28T17:00:00.000Z",
      properties: {
        source: "server",
        $process_person_profile: false,
        $exception_level: "error",
        $exception_list: [
          {
            type: "Error",
            value: "Planning Center responded 503",
            mechanism: { handled: true, synthetic: false, type: "orpc" },
            stacktrace: {
              type: "raw",
              frames: [
                {
                  platform: "node:javascript",
                  filename: "index.js",
                  function: "async run",
                  lineno: 20,
                  colno: 7,
                  in_app: true,
                },
                {
                  platform: "node:javascript",
                  filename: "index.js",
                  function: "createPlanItem",
                  lineno: 10,
                  colno: 5,
                  in_app: true,
                },
              ],
            },
          },
        ],
        $exception_fingerprint: "api:/api/rpc/planItems/create:BAD_GATEWAY",
        error_code: "BAD_GATEWAY",
        path: "/api/rpc/planItems/create",
        method: "POST",
        request_id: "request-1",
      },
    });
  });

  it("labels errors thrown outside oRPC as unhandled", () => {
    const capture = toPostHogExceptionCapture(
      "key",
      { ...request, error: requestErrorSchema.parse("plain string") },
      NOW
    );
    expect(capture.properties).toMatchObject({
      $exception_fingerprint: "api:/api/rpc/planItems/create:UNHANDLED",
      $exception_list: [{ type: "Error", value: "plain string" }],
    });
  });
});

describe(createPostHogExceptionReporter, () => {
  it("is disabled without a project key", () => {
    const send = vi.fn<typeof globalThis.fetch>();
    expect(
      createPostHogExceptionReporter({ apiKey: null, fetch: send })
    ).toBeNull();
    expect(
      createPostHogExceptionReporter({ apiKey: "", fetch: send })
    ).toBeNull();
  });

  it("sends reportable errors and skips expected faults", async () => {
    const send = vi.fn<typeof globalThis.fetch>(
      async () => await Promise.resolve(new Response(null, { status: 200 }))
    );
    const report = createPostHogExceptionReporter({
      apiKey: "key",
      fetch: send,
      now: () => NOW,
    });

    await report?.({ ...request, error: new ORPCError("FORBIDDEN") });
    await report?.({ ...request, error: planningCenterFailure() });

    expect(send).toHaveBeenCalledOnce();
    const body = z
      .object({ event: z.string() })
      .parse(JSON.parse(z.string().parse(send.mock.calls[0]?.[1]?.body)));
    expect(body.event).toBe("$exception");
  });

  it("surfaces PostHog rejections to the caller", async () => {
    const report = createPostHogExceptionReporter({
      apiKey: "key",
      fetch: async () =>
        await Promise.resolve(new Response(null, { status: 400 })),
    });
    await expect(
      report?.({ ...request, error: new Error("defect") })
    ).rejects.toThrow("PostHog capture failed with status 400");
  });
});
