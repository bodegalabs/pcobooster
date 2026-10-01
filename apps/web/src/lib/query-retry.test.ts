import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { retryTransientReadFailure } from "@/lib/query-retry";

describe(retryTransientReadFailure, () => {
  it.each([
    ["BAD_GATEWAY", 502],
    ["INTERNAL_SERVER_ERROR", 500],
  ])("retries a %s once", (code, status) => {
    const error = new ORPCError(code, { status });
    expect(retryTransientReadFailure(0, error)).toBeTruthy();
    expect(retryTransientReadFailure(1, error)).toBeFalsy();
  });

  it("retries a network failure once", () => {
    const error = new TypeError("Load failed");
    expect(retryTransientReadFailure(0, error)).toBeTruthy();
    expect(retryTransientReadFailure(1, error)).toBeFalsy();
  });

  it.each([
    ["UNAUTHORIZED", 401],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
    ["TOO_MANY_REQUESTS", 429],
  ])("does not retry a %s", (code, status) => {
    expect(
      retryTransientReadFailure(0, new ORPCError(code, { status }))
    ).toBeFalsy();
  });
});
