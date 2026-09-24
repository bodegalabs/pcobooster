import { describe, expect, it } from "vitest";

import { forwardRequest, serveStaticPage } from "./passthrough";
import type { ServiceFetcher } from "./server-rpc";

const recordingService = (response: Response = new Response("ok")) => {
  const requests: Request[] = [];
  const service: ServiceFetcher = {
    fetch: async (request) => {
      requests.push(request);
      return await Promise.resolve(response);
    },
  };
  return { service, requests };
};

describe(forwardRequest, () => {
  it("forwards the method, URL, headers, and body unchanged", async () => {
    const { service, requests } = recordingService();
    await forwardRequest(
      service,
      new Request("https://pcobooster.com/api/rpc/plans/list?x=1", {
        method: "PATCH",
        headers: { cookie: "a=b", "content-type": "application/json" },
        body: JSON.stringify({ json: { id: "1" } }),
      })
    );
    const [request] = requests;
    expect(request?.method).toBe("PATCH");
    expect(request?.url).toBe("https://pcobooster.com/api/rpc/plans/list?x=1");
    expect(request?.headers.get("cookie")).toBe("a=b");
    expect(request?.headers.get("content-type")).toBe("application/json");
    await expect(request?.json()).resolves.toStrictEqual({ json: { id: "1" } });
  });

  it("returns redirects to the browser instead of following them", async () => {
    const { service, requests } = recordingService();
    await forwardRequest(service, new Request("https://pcobooster.com/admin"));
    expect(requests[0]?.redirect).toBe("manual");
  });

  it("returns the service response as is", async () => {
    const upstream = new Response("created", {
      status: 201,
      headers: { "set-cookie": "session=1; HttpOnly" },
    });
    const { service } = recordingService(upstream);
    const response = await forwardRequest(
      service,
      new Request("https://pcobooster.com/api/auth/sign-in", { method: "POST" })
    );
    expect(response).toBe(upstream);
  });
});

describe(serveStaticPage, () => {
  it("fetches the staged file on the request's origin", async () => {
    const { service, requests } = recordingService();
    await serveStaticPage(
      service,
      new Request("https://pcobooster.com/about?ref=home", { method: "HEAD" }),
      "/marketing/about.html"
    );
    const [request] = requests;
    expect(request?.url).toBe("https://pcobooster.com/marketing/about.html");
    expect(request?.method).toBe("GET");
  });
});
