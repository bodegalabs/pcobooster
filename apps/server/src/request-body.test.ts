import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { prepareRpcRequest } from "./request-body";

describe(prepareRpcRequest, () => {
  it("preserves the request metadata and JSON body", async () => {
    const controller = new AbortController();
    const request = new Request(
      "https://pcobooster.com/api/rpc/catalog/plans",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "request-1",
        },
        body: JSON.stringify({ json: { serviceTypeId: "1" } }),
        signal: controller.signal,
      }
    );
    const prepared = await prepareRpcRequest(request);
    const buffered = prepared.request();
    expect(buffered.url).toBe(request.url);
    expect(buffered.method).toBe("POST");
    expect([...buffered.headers]).toStrictEqual([...request.headers]);
    await expect(buffered.json()).resolves.toStrictEqual({
      json: { serviceTypeId: "1" },
    });
    controller.abort();
    expect(buffered.signal.aborted).toBeTruthy();
  });

  it("leaves bodyless requests untouched", async () => {
    const request = new Request("https://pcobooster.com/health");
    const prepared = await prepareRpcRequest(request);
    expect(prepared.request()).toBe(request);
  });

  it.each([
    ["/api/auth/sign-out", "application/json"],
    ["/api/rpc/catalog/plans", "multipart/form-data; boundary=test"],
    ["/api/rpc-other", "application/json"],
  ])("leaves %s with %s unconsumed", async (path, contentType) => {
    const request = new Request(`https://pcobooster.com${path}`, {
      method: "POST",
      headers: { "content-type": contentType },
      body: "stream body",
    });
    const prepared = await prepareRpcRequest(request);
    expect(prepared.request()).toBe(request);
    expect(request.bodyUsed).toBeFalsy();
  });

  it("handles the oRPC JSON fallback without a content type", async () => {
    const request = new Request("https://pcobooster.com/api/rpc", {
      method: "POST",
      body: new TextEncoder().encode('{"json":{}}'),
    });
    const prepared = await prepareRpcRequest(request);
    await expect(prepared.request().json()).resolves.toStrictEqual({
      json: {},
    });
  });

  it("propagates a failed body read before initialization can start", async () => {
    const failure = new Error("body disconnected");
    const options: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new ReadableStream({
        start(controller) {
          controller.error(failure);
        },
      }),
      // Node's Request requires this for a test stream; workerd accepts it too.
      duplex: "half",
    };
    const request = new Request(
      "https://pcobooster.com/api/rpc/health",
      options
    );
    await expect(prepareRpcRequest(request)).rejects.toBe(failure);
  });

  it("owns bytes that remain readable after the originating workerd invocation ends", async () => {
    const worker = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        compatibilityDate: "2026-09-01",
        script: `
        const prepareRpcRequest = ${prepareRpcRequest.toString()};
        let original, buffered;
        export default { async fetch(request) {
          if (new URL(request.url).pathname === "/api/rpc/store") {
            original = request;
            buffered = await prepareRpcRequest(request.clone());
            return new Response("stored");
          }
          let originalError;
          try { await original.text(); } catch (error) { originalError = error.message; }
          return Response.json({ originalError, body: await buffered.request().text() });
        } };
      `,
      })
    );
    try {
      await worker.dispatchFetch("http://localhost/api/rpc/store", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "owned body",
      });
      const response = await worker.dispatchFetch("http://localhost/read");
      const result = z
        .object({ originalError: z.string(), body: z.string() })
        .parse(await response.json());
      expect(result.originalError).toContain(
        "Cannot perform I/O on behalf of a different request"
      );
      expect(result.body).toBe("owned body");
    } finally {
      await worker.dispose();
    }
  });
});
