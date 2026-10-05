import { afterEach, describe, expect, it, vi } from "vitest";

import { createNativeAnalytics } from "./analytics";
import type { NativeAnalyticsProperties } from "./analytics";

const makeHarness = (key: string | undefined = "public-project-key") => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response("ok"));
  const enabled = vi.fn<() => boolean>().mockReturnValue(true);
  const distinctId = vi
    .fn<() => string>()
    .mockReturnValue("opaque-installation-id");
  const analytics = createNativeAnalytics({ key, enabled, distinctId, fetch });
  return { analytics, fetch, enabled, distinctId };
};

describe("native analytics privacy boundary", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends an opted-in allowlisted event without person profiles or automatic properties", async () => {
    const { analytics, fetch } = makeHarness();
    await analytics.capture("workflow_completed", {
      operation: "schedule.assign",
    });
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://us.i.posthog.com/i/v0/e/"),
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "public-project-key",
          event: "workflow_completed",
          properties: {
            distinct_id: "opaque-installation-id",
            $process_person_profile: false,
            operation: "schedule.assign",
          },
        }),
      })
    );
  });

  it("never spreads query text, tokens, entities, emails, chart text, or exception messages", async () => {
    const { analytics, fetch } = makeHarness();
    const safe: NativeAnalyticsProperties = {
      operation: "chordCharts.update",
      errorCode: "CONFLICT",
    };
    const callerProperties = {
      ...safe,
      query: "private search",
      demoToken: "demo-token",
      personId: "church-person",
      teamId: "church-team",
      email: "person@example.com",
      chordChart: "private chart text",
      errorMessage: "private provider detail",
      $set: { name: "Person" },
    };
    await analytics.capture("workflow_failed", callerProperties);
    const [, request] = fetch.mock.calls[0] ?? [];
    expect(request?.body).toBe(
      JSON.stringify({
        token: "public-project-key",
        event: "workflow_failed",
        properties: {
          distinct_id: "opaque-installation-id",
          $process_person_profile: false,
          operation: "chordCharts.update",
          error_code: "CONFLICT",
        },
      })
    );
  });

  it("evaluates opt-in on every call and never reads an ID or sends HTTP when opted out", async () => {
    const { analytics, enabled, distinctId, fetch } = makeHarness();
    enabled.mockReturnValue(false);
    await analytics.capture("app_opened");
    expect(distinctId).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    enabled.mockReturnValue(true);
    await analytics.capture("sign_in_started", { operation: "sign_in" });
    enabled.mockReturnValue(false);
    await analytics.capture("sign_in_failed", { errorCode: "SIGN_IN_FAILED" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("stays disabled without a project key or an opaque ID", async () => {
    const missingKey = makeHarness("");
    await missingKey.analytics.capture("app_opened");
    expect(missingKey.enabled).not.toHaveBeenCalled();
    expect(missingKey.fetch).not.toHaveBeenCalled();
    const missingId = makeHarness();
    missingId.distinctId.mockReturnValue(" ");
    await missingId.analytics.capture("app_opened");
    expect(missingId.fetch).not.toHaveBeenCalled();
  });

  it("consumes network and HTTP failures without retrying or capturing recursively", async () => {
    const { analytics, fetch } = makeHarness();
    fetch.mockRejectedValueOnce(new Error("No network"));
    await expect(analytics.capture("app_opened")).resolves.toBeUndefined();
    fetch.mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    await expect(
      analytics.capture("workflow_failed", { errorCode: "NETWORK_ERROR" })
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("bounds a stalled request and releases its timer when it settles", async () => {
    vi.useFakeTimers();
    const { analytics, fetch } = makeHarness();
    fetch.mockImplementationOnce(async (_url, request) => {
      const pending = Promise.withResolvers<undefined>();
      request?.signal?.addEventListener("abort", () => {
        pending.reject(new Error("Request timed out"));
      });
      await pending.promise;
      return new Response("ok");
    });
    const capture = analytics.capture("app_opened");
    await vi.advanceTimersByTimeAsync(5000);
    await expect(capture).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
