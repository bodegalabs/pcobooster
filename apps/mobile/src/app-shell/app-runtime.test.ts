import { createHash, randomBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { makeFixtureFetch } from "../harness/fixture-transport";
import { noLaunchOptions } from "../harness/launch-options";
import {
  memorySecretStorage,
  INSTALL_MARKER_KEY,
} from "../session/credential-store";

vi.stubGlobal("__DEV__", true);
const { makeLiveRuntime } = await import("./app-runtime");

describe("demo.start's request", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends no credential headers when starting a demo from a signed-in account", async () => {
    const requests: Request[] = [];
    const fixtureFetch = makeFixtureFetch({ latencyMs: 0 });
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return await fixtureFetch(input, init);
      }
    );
    vi.stubGlobal("__DEV__", true);
    const runtime = makeLiveRuntime(noLaunchOptions, {
      secrets: memorySecretStorage(),
      appStorage: {
        getItem: async (key) =>
          await Promise.resolve(key === INSTALL_MARKER_KEY ? "true" : null),
        setItem: async () => {
          await Promise.resolve();
        },
      },
      crypto: {
        randomBytes: (count) => new Uint8Array(randomBytes(count)),
        sha256: async (text) =>
          await Promise.resolve(
            new Uint8Array(createHash("sha256").update(text).digest())
          ),
      },
      authenticate: async () => await Promise.resolve(null),
      onForget: undefined,
    });
    await runtime.start();
    await runtime.session.completeSignIn({
      token: "session.signature",
      user: { id: "u1", name: "Jordan", email: "j@example.test" },
      selectedAccountId: "acct1",
    });
    await runtime.session.startDemo("fixture-demo-key");
    expect(runtime.session.getSnapshot().phase.kind).toBe("demo");
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.credentials).toBe("omit");
    expect(
      [
        "authorization",
        "x-pcobooster-account",
        "x-pcobooster-demo",
        "cookie",
      ].map((name) => request?.headers.get(name))
    ).toStrictEqual([null, null, null, null]);
    expect(request?.headers.get("x-pcobooster-client")).toBe("expo;api=1");
  });
});
