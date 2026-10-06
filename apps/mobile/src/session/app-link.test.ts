import { describe, expect, it } from "vitest";

import { demoKeyFromText, parseAppLink } from "./app-link";

const KEY = "k3y-For_The.Demo~42";

describe(parseAppLink, () => {
  it.each([
    `pcobooster://demo/${KEY}`,
    `pcobooster-dev://demo/${KEY}`,
    `https://pcobooster.com/demo/${KEY}`,
    `https://www.pcobooster.com/demo/${KEY}?utm=1`,
  ])("reads the demo key from %s", (url) => {
    expect(parseAppLink(url)).toStrictEqual({ kind: "demo", key: KEY });
  });

  it("ignores demo links without a usable key, and other hosts", () => {
    expect(parseAppLink("pcobooster://demo/short")).toBeNull();
    expect(parseAppLink(`pcobooster://demo/${KEY}/extra`)).toBeNull();
    expect(parseAppLink(`https://evil.example/demo/${KEY}`)).toBeNull();
    expect(parseAppLink(`http://pcobooster.com/demo/${KEY}`)).toBeNull();
  });

  it("marks sign-in callbacks so they are never routed", () => {
    expect(
      parseAppLink("pcobooster-dev://auth/callback?code=x&state=y")
    ).toStrictEqual({ kind: "authCallback" });
  });

  it("passes app paths to the router", () => {
    expect(parseAppLink("pcobooster://services")).toStrictEqual({
      kind: "path",
      path: "/services",
    });
  });
});

describe(demoKeyFromText, () => {
  it.each([
    KEY,
    `  ${KEY}\n`,
    `pcobooster.com/demo/${KEY}`,
    `https://pcobooster.com/demo/${KEY}#top`,
  ])("reads %j", (text) => {
    expect(demoKeyFromText(text)).toBe(KEY);
  });

  it.each([
    "",
    "short",
    "has space key",
    "https://pcobooster.com/plans",
    "a:b",
  ])("rejects %j", (text) => {
    expect(demoKeyFromText(text)).toBeNull();
  });
});
