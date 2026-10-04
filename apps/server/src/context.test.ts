import { testRuntime } from "@pcobooster/api/testing/runtime";
import { testServer } from "@pcobooster/api/testing/server";
import { describe, expect, it, vi } from "vitest";

import { createContext } from "./context";

const contextFor = (server: ReturnType<typeof testServer>) =>
  createContext({
    request: new Request("http://api.test/"),
    runtime: testRuntime(),
    server,
  });

describe(createContext, () => {
  it("gives each request its own loads while sharing loaded values", async () => {
    const server = testServer();
    const first = contextFor(server).server.moduleReadCaches;
    const second = contextFor(server).server.moduleReadCaches;
    const pending = Promise.withResolvers<string>();
    const firstLoad = vi.fn<() => Promise<string>>(
      async () => await pending.promise
    );
    const secondLoad = vi.fn<() => Promise<string>>(
      async () => await Promise.resolve("second")
    );

    const firstRead = first.presentationOrganizationIds.get(
      "scope:org",
      60_000,
      firstLoad
    );
    await expect(
      second.presentationOrganizationIds.get("scope:org", 60_000, secondLoad)
    ).resolves.toBe("second");
    pending.resolve("first");
    await expect(firstRead).resolves.toBe("first");

    const later = contextFor(server).server.moduleReadCaches;
    await expect(
      later.presentationOrganizationIds.get("scope:org", 60_000, secondLoad)
    ).resolves.toBe("first");
    expect(firstLoad).toHaveBeenCalledOnce();
    expect(secondLoad).toHaveBeenCalledOnce();
  });

  it("does not touch a database or Better Auth the request never uses", () => {
    expect(() => contextFor(testServer())).not.toThrow();
  });
});
