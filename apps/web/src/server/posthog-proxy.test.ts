import { describe, expect, it } from "vitest";

import { isPostHogProxyPath, proxyPostHog } from "./posthog-proxy";

describe("PostHog proxy", () => {
  it.each([
    [
      "/ingest/static/recorder.js?v=2",
      "https://us-assets.i.posthog.com/static/recorder.js?v=2",
    ],
    [
      "/ingest/flags/?v=2&config=true",
      "https://us.i.posthog.com/flags/?v=2&config=true",
    ],
    ["/ingest/staticish/file", "https://us.i.posthog.com/staticish/file"],
    ["/ingest/", "https://us.i.posthog.com/"],
  ])("forwards %s to the fixed upstream", async (path, expected) => {
    const response = await proxyPostHog(
      new Request(`https://pcobooster.com${path}`),
      async (input) => {
        const forwarded = new Request(input);
        expect(forwarded.url).toBe(expected);
        expect(forwarded.headers.get("Host")).toBe(new URL(expected).host);
        expect(forwarded.method).toBe("GET");
        return await Promise.resolve(
          new Response("recorder", {
            headers: { "Content-Type": "application/javascript" },
          })
        );
      }
    );
    await expect(response.text()).resolves.toBe("recorder");
    expect(response.headers.get("Content-Type")).toBe("application/javascript");
  });

  it("preserves collection data, strips credentials, and forwards the trusted client IP without caching", async () => {
    const response = await proxyPostHog(
      new Request("https://pcobooster.com/ingest/i/v0/e/?ip=1", {
        method: "POST",
        body: "compressed events",
        headers: {
          Cookie: "session=private",
          Authorization: "Bearer private",
          "CF-Connecting-IP": "203.0.113.4",
          "X-Forwarded-For": "spoofed",
          "Content-Type": "text/plain",
          "User-Agent": "test browser",
        },
      }),
      async (input) => {
        const forwarded = new Request(input);
        expect(forwarded.url).toBe("https://us.i.posthog.com/i/v0/e/?ip=1");
        expect(forwarded.method).toBe("POST");
        await expect(forwarded.text()).resolves.toBe("compressed events");
        expect(Object.fromEntries(forwarded.headers)).toMatchObject({
          host: "us.i.posthog.com",
          "x-forwarded-for": "203.0.113.4",
          "content-type": "text/plain",
          "user-agent": "test browser",
        });
        expect({
          cookie: forwarded.headers.get("Cookie"),
          authorization: forwarded.headers.get("Authorization"),
          cache: forwarded.cache,
          redirect: forwarded.redirect,
        }).toStrictEqual({
          cookie: null,
          authorization: null,
          cache: "no-store",
          redirect: "manual",
        });
        return new Response("accepted", {
          status: 202,
          headers: {
            "Set-Cookie": "upstream=private",
            "Cache-Control": "public",
          },
        });
      }
    );
    expect(response.status).toBe(202);
    await expect(response.text()).resolves.toBe("accepted");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.has("Set-Cookie")).toBeFalsy();
  });

  it("removes untrusted forwarding headers when Cloudflare supplies no IP", async () => {
    const response = await proxyPostHog(
      new Request("https://pcobooster.com/ingest/e", {
        headers: { "X-Forwarded-For": "spoofed" },
      }),
      async (input) =>
        await Promise.resolve(
          new Response(
            new Request(input).headers.get("X-Forwarded-For") ?? "no IP"
          )
        )
    );
    await expect(response.text()).resolves.toBe("no IP");
  });

  it("matches only the ingest path boundary", () => {
    expect(
      [
        "/ingest/e",
        "/ingest/static/recorder.js",
        "/ingestion",
        "/services",
        "/ingest",
      ].map(isPostHogProxyPath)
    ).toStrictEqual([true, true, false, false, false]);
  });
});
