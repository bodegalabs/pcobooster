import { describe, expect, it } from "vitest";

import {
  activeCredentials,
  callbackCode,
  demoKeyFromLink,
  emptySession,
  nativeQueryScope,
  shouldExpireSession,
} from "./protocol";

const account = {
  token: "secret",
  user: {
    id: "jordan",
    name: "Jordan",
    email: "jordan@example.test",
    image: null,
  },
  selectedAccountId: "church1",
};
describe("native auth boundaries", () => {
  it("accepts the exact callback with the current random state", () => {
    expect(
      callbackCode(
        "pcobooster://auth/callback?code=once&state=random",
        "pcobooster://auth/callback",
        "random"
      )
    ).toBe("once");
    expect(() =>
      callbackCode(
        "pcobooster://auth/other?code=once&state=random",
        "pcobooster://auth/callback",
        "random"
      )
    ).toThrow("callback");
    expect(() =>
      callbackCode(
        "pcobooster://auth/callback?code=once&state=old",
        "pcobooster://auth/callback",
        "random"
      )
    ).toThrow("expired");
  });

  it("isolates organizations and demo caches without persisting tokens in cache keys", () => {
    const session = {
      ...emptySession,
      activeUserId: "jordan",
      accounts: [account],
    };
    const first = nativeQueryScope(session, "https://pcobooster.com");
    expect(first).not.toContain("secret");
    expect(
      nativeQueryScope(
        {
          ...session,
          accounts: [{ ...account, selectedAccountId: "church2" }],
        },
        "https://pcobooster.com"
      )
    ).not.toBe(first);
    expect(
      nativeQueryScope(
        { ...session, demoToken: "demo-secret" },
        "https://pcobooster.com"
      )
    ).not.toBe(first);
  });

  it("ignores expired responses from credentials the person already left", () => {
    const first = activeCredentials({
      ...emptySession,
      activeUserId: "jordan",
      accounts: [account],
    });
    expect(shouldExpireSession(first, { ...first, token: "new" })).toBeFalsy();
    expect(
      shouldExpireSession(first, { ...first, accountId: "church2" })
    ).toBeFalsy();
    expect(shouldExpireSession(first, first)).toBeTruthy();
  });

  it("accepts only product demo links and plain keys", () => {
    expect(demoKeyFromLink("https://pcobooster.com/demo/fictional")).toBe(
      "fictional"
    );
    expect(demoKeyFromLink("pcobooster://demo/fictional")).toBe("fictional");
    expect(() => demoKeyFromLink("https://other.test/demo/secret")).toThrow(
      "demo link"
    );
  });
});
