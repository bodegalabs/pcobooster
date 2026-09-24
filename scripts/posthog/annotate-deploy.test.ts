import { describe, expect, it } from "vitest";

import { annotateDeploy } from "./annotate-deploy";

const sha = "abdbf37";
const now = new Date("2026-09-23T20:00:00.000Z");

const rejected: typeof fetch = async () =>
  await Promise.resolve(new Response("forbidden", { status: 403 }));
const offline: typeof fetch = async () =>
  await Promise.reject(new Error("offline"));

describe(annotateDeploy, () => {
  it("skips without calling PostHog when the key is absent", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return await Promise.resolve(new Response("{}"));
    };
    await expect(
      annotateDeploy({ sha, apiKey: undefined, fetchImpl })
    ).resolves.toStrictEqual({
      status: "skipped",
      reason: "POSTHOG_ANNOTATION_API_KEY is not set",
    });
    await expect(
      annotateDeploy({ sha, apiKey: "", fetchImpl })
    ).resolves.toMatchObject({ status: "skipped" });
    expect(calls).toBe(0);
  });

  it("creates a project-wide annotation at the deploy time", async () => {
    const requests: Request[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push(new Request(input, init));
      return await Promise.resolve(Response.json({ id: 1 }, { status: 201 }));
    };
    await expect(
      annotateDeploy({ sha, apiKey: "phx_test", now, fetchImpl })
    ).resolves.toStrictEqual({ status: "created" });
    const [request] = requests;
    expect(request?.url).toBe(
      "https://us.posthog.com/api/projects/614621/annotations/"
    );
    expect(request?.headers.get("authorization")).toBe("Bearer phx_test");
    await expect(request?.json()).resolves.toStrictEqual({
      content: "Deployed abdbf37",
      date_marker: "2026-09-23T20:00:00.000Z",
      scope: "project",
    });
  });

  it("reports PostHog and network failures instead of throwing", async () => {
    await expect(
      annotateDeploy({ sha, apiKey: "phx_test", fetchImpl: rejected })
    ).resolves.toStrictEqual({
      status: "failed",
      reason: "PostHog returned 403",
    });
    await expect(
      annotateDeploy({ sha, apiKey: "phx_test", fetchImpl: offline })
    ).resolves.toStrictEqual({ status: "failed", reason: "offline" });
  });
});
