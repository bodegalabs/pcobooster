import { expect, describe, it } from "vitest";

import { formatDate, formatDateTime } from "./format-date";

describe("admin date formatting", () => {
  it("formats timestamps in Pacific daylight time", () => {
    expect(formatDateTime("2026-09-23T17:05:00.000Z")).toBe(
      "Sep 23, 2026, 10:05 AM PDT"
    );
  });

  it("formats timestamps in Pacific standard time", () => {
    expect(formatDateTime("2026-01-15T20:30:00.000Z")).toBe(
      "Jan 15, 2026, 12:30 PM PST"
    );
  });

  it("uses the Pacific calendar day near UTC midnight", () => {
    expect(formatDate("2026-09-24T03:00:00.000Z")).toBe("Sep 23, 2026");
  });

  it("labels missing timestamps", () => {
    expect(formatDateTime(null)).toBe("Never");
    expect(formatDateTime("")).toBe("Never");
  });
});
