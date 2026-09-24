import { describe, expect, it } from "vitest";

import { readVersion, verifyDeployment } from "./verify-deployment";

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

describe(verifyDeployment, () => {
  it("waits for the home page after the API reports the new version", async () => {
    const homeStatuses = [404, 404, 200];
    const requested: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      requested.push(url);
      return await Promise.resolve(
        url.endsWith("/api/rpc/health")
          ? Response.json({ json: { status: "ok", version: "b57ca91" } })
          : new Response(null, { status: homeStatuses.shift() ?? 500 })
      );
    };
    await verifyDeployment("https://example.test", "b57ca91", {
      fetchImpl,
      intervalMs: 0,
    });
    expect(
      requested.filter((url) => url === "https://example.test")
    ).toHaveLength(3);
    expect(homeStatuses).toStrictEqual([]);
  });
});
