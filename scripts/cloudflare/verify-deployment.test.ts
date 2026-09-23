import { describe, expect, it } from "vitest";

import { readVersion } from "./verify-deployment";

const respondWith =
  (response: Response): typeof fetch =>
  async () =>
    await Promise.resolve(response);

describe(readVersion, () => {
  it("reads the version from a healthy oRPC reply", async () => {
    await expect(
      readVersion(
        "https://example.test",
        respondWith(
          Response.json({ json: { status: "ok", version: "b57ca91" } })
        )
      )
    ).resolves.toBe("b57ca91");
  });

  it.each([
    ["an unversioned reply", Response.json({ json: { status: "ok" } })],
    ["an unwrapped reply", Response.json({ status: "ok", version: "b57ca91" })],
    ["an HTML page", new Response("<html>", { status: 200 })],
    ["a server error", new Response("down", { status: 503 })],
  ])("treats %s as not yet deployed", async (_label, response) => {
    await expect(
      readVersion("https://example.test", respondWith(response))
    ).resolves.toBeUndefined();
  });
});
