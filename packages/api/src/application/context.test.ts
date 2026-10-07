import { describe, expect, it } from "vitest";

import { createRequestContext } from "./context";

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/u;

const contextFor = (requestId: string | null) =>
  createRequestContext(
    new Request("https://api.test/api/v1/health", {
      headers: requestId === null ? {} : { "x-request-id": requestId },
    })
  );

describe(createRequestContext, () => {
  it("keeps a client request ID that follows the shared grammar", () => {
    expect(contextFor("0192f0c4-7a3e-7cc1-9a51-6d2f00a1b2c3").requestId).toBe(
      "0192f0c4-7a3e-7cc1-9a51-6d2f00a1b2c3"
    );
  });

  it.each([
    null,
    "",
    "short",
    "has spaces in it",
    "a".repeat(65),
    "<b>bold</b>x",
  ])("replaces %o with a fresh UUID", (requestId) => {
    const { requestId: logged } = contextFor(requestId);
    expect(logged).toMatch(UUID);
    expect(logged).not.toBe(requestId);
  });
});
