import { getPlanningCenterIdentityFromAccessToken } from "@pcobooster/api/auth/planning-center-identity";
import { PLANNING_CENTER_USER_AGENT } from "@pcobooster/api/planning-center/user-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

describe(getPlanningCenterIdentityFromAccessToken, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("identifies itself to Planning Center with a User-Agent", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ sub: "person-1" }));
    vi.stubGlobal("fetch", fetch);
    const identity = await getPlanningCenterIdentityFromAccessToken("token");
    expect(identity?.sub).toBe("person-1");
    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
    expect(headers.get("User-Agent")).toBe(PLANNING_CENTER_USER_AGENT);
    expect(headers.get("Authorization")).toBe("Bearer token");
  });
});
