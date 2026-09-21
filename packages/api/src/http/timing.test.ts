import {
  elapsedMs,
  formatDurationMs,
  setRouteTimingHeaders,
} from "@worship-admin/api/http/timing";
import { describe, expect, it } from "vitest";

describe("http timing helpers", () => {
  it("formats durations for response headers and logs", () => {
    expect(formatDurationMs(12.345)).toBe("12.3");
    expect(formatDurationMs(-4)).toBe("0.0");
    expect(formatDurationMs(Number.NaN)).toBe("0.0");
  });

  it("never reports negative elapsed time", () => {
    expect(elapsedMs(10, 4)).toBe(0);
    expect(elapsedMs(10, 13.25)).toBe(3.25);
  });

  it("sets route timing headers", () => {
    const headers = new Headers();

    setRouteTimingHeaders(headers, 42.24);

    expect(headers.get("Server-Timing")).toBe("app;dur=42.2");
    expect(headers.get("x-worshipadmin-route-ms")).toBe("42.2");
  });
});
