import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlanningCenterCoreClient } from "@/lib/planning-center/core-client";

const originalClient = process.env.PLANNING_CENTER_CLIENT;
const originalPat = process.env.PLANNING_CENTER_PAT;
const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("PlanningCenterCoreClient", () => {
  beforeEach(() => {
    process.env.PLANNING_CENTER_CLIENT = "client";
    process.env.PLANNING_CENTER_PAT = "pat";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    process.env.PLANNING_CENTER_CLIENT = originalClient;
    process.env.PLANNING_CENTER_PAT = originalPat;
  });

  it("dedupes concurrent identical GET JSON fetches", async () => {
    let resolveFetch: (response: Response) => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new PlanningCenterCoreClient();
    const first = client.fetch<{ attributes: { name: string } }>(
      "/services/v2/people/1"
    );
    const second = client.fetch<{ attributes: { name: string } }>(
      "/services/v2/people/1"
    );

    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(
      jsonResponse({
        data: {
          id: "1",
          type: "Person",
          attributes: { name: "Alex" },
        },
      })
    );

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toEqual(secondResult);
    expect(firstResult).not.toBe(secondResult);

    firstResult.data.attributes.name = "Changed locally";
    expect(secondResult.data.attributes.name).toBe("Alex");
  });

  it("does not dedupe writes", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ data: { id: "1" } }))
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new PlanningCenterCoreClient();
    await Promise.all([
      client.fetch("/services/v2/people", { method: "POST", body: "{}" }),
      client.fetch("/services/v2/people", { method: "POST", body: "{}" }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("allows successful empty write responses", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 204 }))
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new PlanningCenterCoreClient();

    await expect(
      client.fetch("/services/v2/service_types/st-1/plan_times/time-1", {
        method: "DELETE",
      })
    ).resolves.toBeUndefined();
  });
});
