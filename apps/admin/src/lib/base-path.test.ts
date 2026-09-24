import { describe, expect, it } from "vitest";

import {
  productSignInUrl,
  resolveAdminBase,
  withMountTrailingSlash,
} from "./base-path";

describe(resolveAdminBase, () => {
  it.each([
    ["/admin", false, "/admin/"],
    ["/admin", true, "/admin/"],
    ["", false, "/"],
    ["", true, "/"],
    [undefined, true, "/admin/"],
    [undefined, false, "/"],
  ] as const)(
    "maps %j (dev server: %s) to %s",
    (basePath, devServer, expected) => {
      expect(resolveAdminBase(basePath, devServer)).toBe(expected);
    }
  );
});

describe(productSignInUrl, () => {
  it("returns to the product's admin route when mounted under it", () => {
    expect(productSignInUrl("http://127.0.0.1:3001", "/admin/")).toBe(
      "http://127.0.0.1:3001/auth?next=%2Fadmin"
    );
  });

  it("omits the return path on the admin subdomain", () => {
    expect(productSignInUrl("https://pcobooster.com", "/")).toBe(
      "https://pcobooster.com/auth"
    );
  });
});

describe(withMountTrailingSlash, () => {
  it.each([
    ["/admin", "/admin/"],
    ["/admin?tab=1", "/admin/?tab=1"],
    ["/admin/", "/admin/"],
    ["/admin/users/abc", "/admin/users/abc"],
    ["/administrator", "/administrator"],
    ["/admin/_serverFn/abc", "/admin/_serverFn/abc"],
  ])("serves %s as %s under /admin/", (path, expected) => {
    expect(withMountTrailingSlash(path, "/admin/")).toBe(expected);
  });

  it("leaves root-mounted paths alone", () => {
    expect(withMountTrailingSlash("/users/abc", "/")).toBe("/users/abc");
  });
});
