import { describe, expect, it } from "vitest";

import {
  readVersion,
  readWebVersion,
  verifyDeployment,
  withAccessServiceToken,
} from "./verify-deployment";

const respondWith =
  (response: Response): typeof fetch =>
  async () =>
    await Promise.resolve(response);

describe(readVersion, () => {
  it("reads the version from a healthy HTTP reply", async () => {
    await expect(
      readVersion(
        "https://example.test",
        respondWith(Response.json({ status: "ok", version: "b57ca91" }))
      )
    ).resolves.toBe("b57ca91");
  });

  it.each([
    ["an unversioned reply", Response.json({ json: { status: "ok" } })],
    [
      "an obsolete wrapped reply",
      Response.json({ json: { status: "ok", version: "b57ca91" } }),
    ],
    ["an HTML page", new Response("<html>", { status: 200 })],
    ["a server error", new Response("down", { status: 503 })],
  ])("treats %s as not yet deployed", async (_label, response) => {
    await expect(
      readVersion("https://example.test", respondWith(response))
    ).resolves.toBeUndefined();
  });
});

describe(readWebVersion, () => {
  it("reads the web Worker's version", async () => {
    await expect(
      readWebVersion(
        "https://example.test",
        respondWith(Response.json({ version: "b57ca91" }))
      )
    ).resolves.toBe("b57ca91");
  });

  it.each([
    ["an HTML page", new Response("<html>", { status: 200 })],
    ["a sign-in redirect", new Response(null, { status: 307 })],
    ["a missing route", new Response("missing", { status: 404 })],
  ])("treats %s as not yet deployed", async (_label, response) => {
    await expect(
      readWebVersion("https://example.test", respondWith(response))
    ).resolves.toBeUndefined();
  });
});

interface Deployed {
  web: string;
  api: string;
  homeStatuses: number[];
}

const deployedOrigin = (deployed: Deployed) => {
  const requested: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    requested.push(url);
    if (url.endsWith("/api/health")) {
      return await Promise.resolve(
        Response.json({ status: "ok", version: deployed.api })
      );
    }
    if (url.endsWith("/version")) {
      return await Promise.resolve(Response.json({ version: deployed.web }));
    }
    return await Promise.resolve(
      new Response(null, { status: deployed.homeStatuses.shift() ?? 500 })
    );
  };
  return { fetchImpl, requested };
};

describe(verifyDeployment, () => {
  it("waits for the home page after both Workers report the new version", async () => {
    const deployed = {
      web: "b57ca91",
      api: "b57ca91",
      homeStatuses: [404, 404, 200],
    };
    const { fetchImpl, requested } = deployedOrigin(deployed);
    await verifyDeployment("https://example.test", "b57ca91", {
      fetchImpl,
      intervalMs: 0,
    });
    expect(
      requested.filter((url) => url === "https://example.test")
    ).toHaveLength(3);
    expect(deployed.homeStatuses).toStrictEqual([]);
  });

  it("fails while the web Worker still serves the previous commit", async () => {
    const { fetchImpl } = deployedOrigin({
      web: "0fc13cc",
      api: "b57ca91",
      homeStatuses: [],
    });
    await expect(
      verifyDeployment("https://example.test", "b57ca91", {
        fetchImpl,
        intervalMs: 0,
        deadlineMs: 20,
      })
    ).rejects.toThrow(
      "https://example.test/version served 0fc13cc, expected b57ca91"
    );
  });

  it("fails while the API still serves the previous commit", async () => {
    const { fetchImpl } = deployedOrigin({
      web: "b57ca91",
      api: "0fc13cc",
      homeStatuses: [],
    });
    await expect(
      verifyDeployment("https://example.test", "b57ca91", {
        fetchImpl,
        intervalMs: 0,
        deadlineMs: 20,
      })
    ).rejects.toThrow(
      "https://example.test API served 0fc13cc, expected b57ca91"
    );
  });
});

const recordHeaders = () => {
  const seen: Headers[] = [];
  const fetchImpl: typeof fetch = Object.assign(
    async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      seen.push(new Headers(init?.headers));
      return await Promise.resolve(new Response("ok"));
    },
    fetch
  );
  return { seen, fetchImpl };
};

describe(withAccessServiceToken, () => {
  it("sends the service token alongside the request's own headers", async () => {
    const { seen, fetchImpl } = recordHeaders();
    const accessFetch = withAccessServiceToken(fetchImpl, {
      CLOUDFLARE_ACCESS_CLIENT_ID: "client.access",
      CLOUDFLARE_ACCESS_CLIENT_SECRET: "secret",
    });
    await accessFetch("https://example.test/version", {
      headers: { accept: "application/json" },
    });
    expect(seen[0]?.get("CF-Access-Client-Id")).toBe("client.access");
    expect(seen[0]?.get("CF-Access-Client-Secret")).toBe("secret");
    expect(seen[0]?.get("accept")).toBe("application/json");
  });

  it("leaves fetch unchanged without a service token", () => {
    const { fetchImpl } = recordHeaders();
    expect(withAccessServiceToken(fetchImpl, {})).toBe(fetchImpl);
  });

  it("rejects a half-configured service token", () => {
    const { fetchImpl } = recordHeaders();
    expect(() =>
      withAccessServiceToken(fetchImpl, { CLOUDFLARE_ACCESS_CLIENT_ID: "id" })
    ).toThrow("Set both");
  });
});
