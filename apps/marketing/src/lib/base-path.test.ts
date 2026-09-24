import { describe, expect, it } from "vitest";

import { withPublicBase, withoutPublicBase } from "./base-path";

const base = "/marketing/";

describe(withPublicBase, () => {
  it.each([
    ["/", "/marketing/"],
    ["/about", "/marketing/about"],
    ["/about/?ref=1", "/marketing/about/?ref=1"],
    ["/marketing/", "/marketing/"],
    ["/marketing/assets/index.js", "/marketing/assets/index.js"],
  ])("maps %s to %s", (url, expected) => {
    expect(withPublicBase(url, base)).toBe(expected);
  });
});

describe(withoutPublicBase, () => {
  it.each([
    ["/marketing/", "/"],
    ["/marketing/about", "/about"],
    ["/marketing/about/?ref=1", "/about/?ref=1"],
    ["/about", "/about"],
    ["/marketing-private", "/marketing-private"],
  ])("maps %s to %s", (url, expected) => {
    expect(withoutPublicBase(url, base)).toBe(expected);
  });
});
