import type { ActivityEventInput } from "@pcobooster/api/db/activity-events";
import {
  createPostHogActivityForwarder,
  toPostHogCapture,
} from "@pcobooster/api/modules/analytics/posthog-activity";
import { vi, describe, expect, it } from "vitest";
import { z } from "zod";

const NOW = new Date("2026-09-23T17:00:00.000Z");

const scheduleEvent: ActivityEventInput = {
  eventType: "schedule_attempt",
  actorUserId: "user-1",
  actorAccountId: "account-1",
  ipAddress: "203.0.113.9",
  userAgent: "Mozilla/5.0",
  success: false,
  statusCode: 409,
  errorCode: "POSITION_MISMATCH",
  serviceTypeId: "st-1",
  personId: "person-1",
  planId: "plan-1",
  teamId: "team-1",
  positionId: "position-1",
  metadata: { oneOff: false, personId: "person-1", planPersonId: "pp-1" },
};

describe(toPostHogCapture, () => {
  it("keys events by user ID and omits request fingerprints and people", () => {
    expect(toPostHogCapture("key", scheduleEvent, null, NOW)).toStrictEqual({
      api_key: "key",
      event: "schedule assign attempted",
      distinct_id: "user-1",
      timestamp: "2026-09-23T17:00:00.000Z",
      properties: {
        source: "server",
        success: false,
        status_code: 409,
        error_code: "POSITION_MISMATCH",
        service_type_id: "st-1",
        plan_id: "plan-1",
        team_id: "team-1",
        position_id: "position-1",
        schedule_status: null,
        organization_id: null,
        one_off: false,
      },
    });
  });

  it("sets person properties on sign-in", () => {
    const capture = toPostHogCapture(
      "key",
      { eventType: "auth_session_created", actorUserId: "user-1" },
      {
        email: "ada@example.com",
        name: "Ada",
        organizationId: "org-1",
        organizationName: "Grace Church",
      },
      NOW
    );
    expect(capture?.event).toBe("signed in");
    expect(capture?.properties.$set).toStrictEqual({
      email: "ada@example.com",
      name: "Ada",
      organization_id: "org-1",
      organization_name: "Grace Church",
    });
  });

  it("skips events without a user", () => {
    expect(
      toPostHogCapture(
        "key",
        { eventType: "auth_session_deleted", actorUserId: null },
        null,
        NOW
      )
    ).toBeNull();
  });
});

describe(createPostHogActivityForwarder, () => {
  it("does not send without a key", async () => {
    const send = vi.fn<typeof fetch>();
    await createPostHogActivityForwarder({ apiKey: undefined, fetch: send })(
      scheduleEvent
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("posts the capture payload", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    await createPostHogActivityForwarder({
      apiKey: "key",
      fetch: send,
      now: () => NOW,
    })(scheduleEvent);
    const [url, init] = send.mock.calls[0] ?? [];
    expect(url).toBe("https://us.i.posthog.com/i/v0/e/");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(z.string().parse(init?.body))).toStrictEqual(
      toPostHogCapture("key", scheduleEvent, null, NOW)
    );
  });

  it("rejects failed deliveries so callers can log them", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 500 }));
    await expect(
      createPostHogActivityForwarder({ apiKey: "key", fetch: send })(
        scheduleEvent
      )
    ).rejects.toThrow("PostHog capture failed with status 500");
  });
});
