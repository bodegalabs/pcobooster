import { describe, expect, it } from "vitest";

import { productSignInUrl, resolveAdminBase } from "./base-path";

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
