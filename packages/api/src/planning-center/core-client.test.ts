import type { JsonValue } from "@worship-admin/api/json";
import { PlanningCenterCoreClient } from "@worship-admin/api/planning-center/core-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const jsonResponse = (body: JsonValue, init?: ResponseInit): Response =>
  Response.json(body, init);
const person = { id: "1", type: "Person", attributes: { name: "Alex" } };

describe(PlanningCenterCoreClient, () => {
  beforeEach(() => {
    vi.stubEnv("PLANNING_CENTER_CLIENT", "client");
    vi.stubEnv("PLANNING_CENTER_PAT", "pat");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("dedupes concurrent identical GETs and isolates the returned objects", async () => {
    const deferred = Promise.withResolvers<Response>();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValue(deferred.promise);
    const client = new PlanningCenterCoreClient();
    const first = client.fetch("/services/v2/people/1");
    const second = client.fetch("/services/v2/people/1");
    expect(fetchMock).toHaveBeenCalledOnce();
    deferred.resolve(jsonResponse({ data: person }));
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toStrictEqual(secondResult);
    expect(firstResult).not.toBe(secondResult);
    firstResult.data.attributes.name = "Changed locally";
    expect(secondResult.data.attributes.name).toBe("Alex");
  });

  it("does not share requests between access tokens", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ data: person }))
      .mockResolvedValueOnce(jsonResponse({ data: person }));
    await Promise.all([
      new PlanningCenterCoreClient({ accessToken: "first-token" }).fetch(
        "/services/v2/people/1"
      ),
      new PlanningCenterCoreClient({ accessToken: "second-token" }).fetch(
        "/services/v2/people/1"
      ),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not dedupe writes", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ data: person }))
      .mockResolvedValueOnce(jsonResponse({ data: person }));
    const client = new PlanningCenterCoreClient();
    await Promise.all([
      client.fetch("/services/v2/people", { method: "POST", body: "{}" }),
      client.fetch("/services/v2/people", { method: "POST", body: "{}" }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("accepts empty writes through the transport method", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 })
    );
    const response = await new PlanningCenterCoreClient().request(
      "/services/v2/plan_times/1",
      { method: "DELETE" }
    );
    expect(response.status).toBe(204);
  });

  it("rejects an empty response where a JSON resource is required", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 })
    );
    await expect(
      new PlanningCenterCoreClient().fetch("/services/v2/people/1")
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects malformed resource identifiers before they enter service code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ data: { id: 1, type: "Person" } })
    );
    await expect(
      new PlanningCenterCoreClient().fetch("/services/v2/people/1")
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  it("normalizes a singleton collection and preserves null relationships", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        data: { ...person, relationships: { team: { data: null } } },
        links: { next: null },
      })
    );
    const response = await new PlanningCenterCoreClient().fetchCollection(
      "/services/v2/people"
    );
    expect(response.data).toStrictEqual([
      { ...person, relationships: { team: { data: null } } },
    ]);
    expect(response.links?.next).toBeUndefined();
  });

  it("accepts an absent relationship URL in schedule collections", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        data: [
          {
            type: "Schedule",
            id: "schedule-1",
            relationships: { plan_times: { links: { related: null } } },
          },
        ],
      })
    );
    const response = await new PlanningCenterCoreClient().fetchCollection(
      "/services/v2/people/me/schedules"
    );
    expect(response.data).toStrictEqual([
      {
        type: "Schedule",
        id: "schedule-1",
        attributes: {},
        relationships: { plan_times: { links: { related: undefined } } },
      },
    ]);
  });

  it("follows pagination once per URL and deduplicates included resources", async () => {
    const firstUrl =
      "https://api.planningcenteronline.com/services/v2/people?per_page=100";
    const secondUrl =
      "https://api.planningcenteronline.com/services/v2/people?offset=100";
    const team = { type: "Team", id: "team-1", attributes: { name: "Band" } };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          data: [person],
          included: [team],
          links: { next: secondUrl },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ ...person, id: "2" }],
          included: [team],
          links: { next: firstUrl },
        })
      );
    const response = await new PlanningCenterCoreClient().fetchAllWithIncluded(
      "/services/v2/people"
    );
    expect(response.data.map((item) => item.id)).toStrictEqual(["1", "2"]);
    expect(response.included).toStrictEqual([team]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a transient GET failure", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ error: "Temporarily unavailable" }, { status: 503 })
      )
      .mockResolvedValueOnce(jsonResponse({ data: person }));
    const response = await new PlanningCenterCoreClient().fetch(
      "/services/v2/people/1"
    );
    expect(response.data.id).toBe("1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a write after a transient error", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse({ error: "Temporarily unavailable" }, { status: 503 })
      );
    await expect(
      new PlanningCenterCoreClient().fetch("/services/v2/people", {
        method: "POST",
        body: "{}",
      })
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("honors caller cancellation without retrying", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new DOMException("Canceled", "AbortError"));
    await expect(
      new PlanningCenterCoreClient().fetch("/services/v2/people/1", {
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
