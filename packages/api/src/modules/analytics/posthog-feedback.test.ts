import {
  createPostHogFeedbackForwarder,
  toPostHogFeedbackCapture,
} from "@pcobooster/api/modules/analytics/posthog-feedback";
import type { SubmittedFeedback } from "@pcobooster/api/modules/analytics/posthog-feedback";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

const NOW = new Date("2026-09-23T17:00:00.000Z");

const feedback: SubmittedFeedback = {
  id: 7,
  userId: "user-1",
  message: "The lineup view froze after I dragged a song.",
  path: "/services/st-1/plans/plan-1/lineup",
  sessionId: "session-1",
};

describe(toPostHogFeedbackCapture, () => {
  it("keys feedback by user and links it to the replay session", () => {
    expect(
      toPostHogFeedbackCapture(
        "key",
        feedback,
        {
          email: "ada@example.com",
          name: "Ada",
          organizationId: "org-1",
          organizationName: "Grace Church",
        },
        NOW
      )
    ).toStrictEqual({
      api_key: "key",
      event: "feedback submitted",
      distinct_id: "user-1",
      timestamp: "2026-09-23T17:00:00.000Z",
      properties: {
        source: "server",
        feedback_id: 7,
        message: "The lineup view froze after I dragged a song.",
        path: "/services/st-1/plans/plan-1/lineup",
        $session_id: "session-1",
        $set: {
          email: "ada@example.com",
          name: "Ada",
          organization_id: "org-1",
          organization_name: "Grace Church",
        },
      },
    });
  });

  it("keeps Planning Center person IDs out of the path", () => {
    const capture = toPostHogFeedbackCapture(
      "key",
      { ...feedback, path: "/people/person-42" },
      null,
      NOW
    );
    expect(capture.properties).toMatchObject({ path: "/people/:personId" });
  });

  it("omits the session and person when unknown", () => {
    const capture = toPostHogFeedbackCapture(
      "key",
      { ...feedback, sessionId: null },
      null,
      NOW
    );
    expect(Object.keys(capture.properties)).toStrictEqual([
      "source",
      "feedback_id",
      "message",
      "path",
    ]);
  });
});

describe(createPostHogFeedbackForwarder, () => {
  it("is disabled without a key", () => {
    expect(
      createPostHogFeedbackForwarder({
        apiKey: undefined,
        fetch: vi.fn<typeof fetch>(),
      })
    ).toBeNull();
  });

  it("posts the capture payload", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    const forward = createPostHogFeedbackForwarder({
      apiKey: "key",
      fetch: send,
      now: () => NOW,
    });
    await forward?.(feedback, null);
    const [url, init] = send.mock.calls[0] ?? [];
    expect(url).toBe("https://us.i.posthog.com/i/v0/e/");
    expect(JSON.parse(z.string().parse(init?.body))).toStrictEqual(
      toPostHogFeedbackCapture("key", feedback, null, NOW)
    );
  });
});
