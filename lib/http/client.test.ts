import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { deleteJson, getJson, patchJson, postJson } from "@/lib/http/client";
import type { JsonValue } from "@/lib/json";

const jsonResponse = (body: JsonValue, init?: ResponseInit): Response =>
  Response.json(body, {
    headers: { "content-type": "application/json" },
    ...init,
  });

describe("HTTP JSON helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses successful JSON with the supplied schema, including dates", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValue(
      jsonResponse({ id: "plan-1", startsAt: "2026-09-20T17:00:00.000Z" })
    );
    const responseSchema = z.object({
      id: z.string(),
      startsAt: z.coerce.date(),
    });

    const result = await getJson("/api/plans/plan-1", responseSchema);

    expect(result.startsAt).toStrictEqual(new Date("2026-09-20T17:00:00.000Z"));
    expect(fetchMock).toHaveBeenCalledWith("/api/plans/plan-1", {
      method: "GET",
    });
  });

  it("rejects successful JSON that does not match the supplied schema", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValue(jsonResponse({ id: 123 }));
    const responseSchema = z.object({ id: z.string() });

    await expect(
      getJson("/api/plans/plan-1", responseSchema)
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  it("turns a structured API error into a readable HttpClientError", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: "You do not have access to this plan",
          code: "FORBIDDEN",
          details: { planId: "plan-1" },
        },
        { status: 403, statusText: "Forbidden" }
      )
    );

    await expect(
      getJson("/api/plans/plan-1", z.object({ id: z.string() }))
    ).rejects.toMatchObject({
      name: "HttpClientError",
      status: 403,
      code: "FORBIDDEN",
      message: "You do not have access to this plan",
      details: { planId: "plan-1" },
    });
  });

  it("uses a status fallback for an HTML error response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValue(
      new Response("<html>gateway failure</html>", {
        status: 502,
        headers: { "content-type": "text/html" },
      })
    );

    await expect(
      getJson("/api/plans", z.array(z.string()))
    ).rejects.toMatchObject({
      name: "HttpClientError",
      status: 502,
      message: "Request failed with status 502",
    });
  });

  it("rejects invalid JSON and successful non-JSON responses", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response("{invalid", {
        headers: { "content-type": "application/json" },
      })
    );
    await expect(
      getJson("/api/invalid", z.object({ id: z.string() }))
    ).rejects.toBeInstanceOf(SyntaxError);

    fetchMock.mockResolvedValueOnce(
      new Response("<html>not JSON</html>", {
        headers: { "content-type": "text/html" },
      })
    );
    await expect(
      getJson("/api/html", z.object({ id: z.string() }))
    ).rejects.toMatchObject({
      status: 200,
      code: "INVALID_RESPONSE",
      message: "Expected a JSON response",
    });
  });

  it.each([
    [
      "empty 200 response",
      new Response("", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ],
    ["204 response", new Response(null, { status: 204 })],
  ])(
    "parses %s through an undefined response schema",
    async (_label, response) => {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      fetchMock.mockResolvedValue(response);

      await expect(
        getJson("/api/empty", z.undefined())
      ).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledOnce();
    }
  );

  it("merges mutation headers, serializes bodies, and uses each mutation method", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const responseSchema = z.object({ ok: z.boolean() });
    const requestHeaders = new Headers({
      Authorization: "Bearer test-token",
      "X-Request-ID": "request-1",
    });

    await postJson(
      "/api/items",
      responseSchema,
      { name: "first" },
      {
        headers: requestHeaders,
      }
    );
    await patchJson("/api/items/1", responseSchema, { name: "second" });
    await deleteJson("/api/items/1", responseSchema, { reason: "cleanup" });

    expect(
      fetchMock.mock.calls.map(([url, init]) => [url, init?.method])
    ).toStrictEqual([
      ["/api/items", "POST"],
      ["/api/items/1", "PATCH"],
      ["/api/items/1", "DELETE"],
    ]);
    expect(fetchMock.mock.calls.map(([, init]) => init?.body)).toStrictEqual([
      JSON.stringify({ name: "first" }),
      JSON.stringify({ name: "second" }),
      JSON.stringify({ reason: "cleanup" }),
    ]);
    const firstInit = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(firstInit?.headers).get("authorization")).toBe(
      "Bearer test-token"
    );
    expect(new Headers(firstInit?.headers).get("content-type")).toBe(
      "application/json"
    );
  });
});
