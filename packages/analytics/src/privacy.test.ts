import { describe, expect, it } from "vitest";

import {
  analyticsPath,
  analyticsUrl,
  canInitializeAnalytics,
  prepareAnalyticsEvent,
  sanitizeAnalyticsProperties,
} from "./privacy";

describe("analytics privacy boundary", () => {
  it("sanitizes SDK top-level person attribution on identify", () => {
    const event = prepareAnalyticsEvent(
      {
        uuid: "test-event",
        event: "$identify",
        properties: { distinct_id: "user", $anon_distinct_id: "visitor" },
        $set: { email: "private@example.com" },
        $set_once: {
          $initial_referrer: "https://example.com/private?token=secret",
          $initial_current_url: "https://pcobooster.com/auth?code=secret",
        },
      },
      "/services",
      true
    );
    expect(event?.properties).toStrictEqual({
      distinct_id: "user",
      $anon_distinct_id: "visitor",
      surface: "app",
      is_authenticated: true,
    });
    expect(event?.$set).toStrictEqual({});
    expect(event?.$set_once).toStrictEqual({
      $initial_referrer: "https://example.com",
      $initial_current_url: "https://pcobooster.com/auth",
    });
  });

  it("drops demo, unauthenticated product, and unsolicited SDK events", () => {
    const event = { uuid: "test-event", event: "$pageview", properties: {} };
    expect(prepareAnalyticsEvent(event, "/demo/private-key", true)).toBeNull();
    expect(prepareAnalyticsEvent(event, "/services", false)).toBeNull();
    expect(
      prepareAnalyticsEvent({ ...event, event: "$snapshot" }, "/services", true)
    ).toBeNull();
    expect(
      prepareAnalyticsEvent({ ...event, event: "$autocapture" }, "/", false)
    ).toBeNull();
    expect(
      prepareAnalyticsEvent(
        { ...event, event: "$feature_flag_called" },
        "/",
        false
      )
    ).toBeNull();
  });

  it("collapses provider IDs while preserving the feature being used", () => {
    expect(analyticsPath("/services/123/plans/456/lineup")).toBe(
      "/services/:serviceTypeId/plans/:planId/lineup"
    );
    expect(analyticsPath("/services/123/plans/456")).toBe(
      "/services/:serviceTypeId/plans/:planId/assign"
    );
    expect(analyticsPath("/people/987")).toBe("/people/:personId");
    expect(analyticsPath("/demo/private-key")).toBe("/other");
    expect(analyticsPath("/admin/users/private-id")).toBe("/other");
  });

  it("removes query strings, fragments, and external referrer paths", () => {
    expect(
      analyticsUrl(
        "https://pcobooster.com/auth?code=secret&returnTo=/people/123#token"
      )
    ).toBe("https://pcobooster.com/auth");
    expect(
      analyticsUrl(
        "https://login.planningcenteronline.com/private?email=person@example.com"
      )
    ).toBe("https://login.planningcenteronline.com");
    expect(analyticsUrl("not a URL")).toBe("");
  });

  it("sanitizes nested attribution and drops unspecified payloads", () => {
    expect(
      sanitizeAnalyticsProperties({
        distinct_id: "app-user-id",
        $current_url: "https://pcobooster.com/people/123?name=secret",
        $set: {
          email: "private@example.com",
          $initial_current_url: "https://pcobooster.com/demo/private-key",
          $initial_utm_source: "newsletter",
        },
        $set_once: {
          name: "Private person",
          $initial_referrer: "https://example.com/private?token=secret",
        },
        operation: "schedule.assign",
        response: { person: "Private person" },
        $title: "Private plan title",
        $exception_message: "Private payload",
      })
    ).toStrictEqual({
      distinct_id: "app-user-id",
      $current_url: "https://pcobooster.com/people/:personId",
      $set: {
        $initial_current_url: "https://pcobooster.com/other",
        $initial_utm_source: "newsletter",
      },
      $set_once: { $initial_referrer: "https://example.com" },
      operation: "schedule.assign",
    });
  });

  it("keeps local, preview, and unconfigured environments out of production", () => {
    expect(canInitializeAnalytics("key", "pcobooster.com", true)).toBeTruthy();
    expect(
      canInitializeAnalytics("key", "preview.vercel.app", true)
    ).toBeFalsy();
    expect(canInitializeAnalytics("key", "127.0.0.1", true)).toBeFalsy();
    expect(canInitializeAnalytics("key", "pcobooster.com", false)).toBeFalsy();
    expect(
      canInitializeAnalytics(undefined, "pcobooster.com", true)
    ).toBeFalsy();
  });
});
