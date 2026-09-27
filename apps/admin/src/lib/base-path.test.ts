import { describe, expect, it } from "vitest";

import { resolveAdminBase } from "./base-path";

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
