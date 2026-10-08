import { serverDependenciesForRequest } from "@pcobooster/api/server";
import { testServer } from "@pcobooster/api/testing/server";
import { describe, expect, it, vi } from "vitest";

describe(serverDependenciesForRequest, () => {
  it("gives each request its own loads while sharing loaded values", async () => {
    const server = testServer();
    const first = serverDependenciesForRequest(server).moduleReadCaches;
    const second = serverDependenciesForRequest(server).moduleReadCaches;
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

    const later = serverDependenciesForRequest(server).moduleReadCaches;
    await expect(
      later.presentationOrganizationIds.get("scope:org", 60_000, secondLoad)
    ).resolves.toBe("first");
    expect(firstLoad).toHaveBeenCalledOnce();
    expect(secondLoad).toHaveBeenCalledOnce();
  });
});
