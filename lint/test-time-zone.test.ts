import { describe, expect, it } from "vitest";

describe("test host time zone", () => {
  it("runs tests in UTC like Cloudflare Workers, whatever the machine zone", () => {
    expect(process.env.TZ).toBe("UTC");
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("UTC");
    expect(new Date("2026-07-01T00:00:00Z").getTimezoneOffset()).toBe(0);
  });
});
