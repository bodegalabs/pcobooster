import { describe, expect, it } from "vitest";

import { demoTokenFromSetCookie } from "./demo-cookie";

describe(demoTokenFromSetCookie, () => {
  it("reads the demo token among other cookies, past an Expires date's comma", () => {
    expect(
      demoTokenFromSetCookie(
        "a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/, pcobooster-demo=abc_DEF-123; Path=/; HttpOnly; SameSite=Lax"
      )
    ).toBe("abc_DEF-123");
  });

  it("ignores an expiring or empty demo cookie, a lookalike name, and no header", () => {
    expect(
      demoTokenFromSetCookie("pcobooster-demo=abc; Max-Age=0; Path=/")
    ).toBeNull();
    expect(demoTokenFromSetCookie("pcobooster-demo=; Path=/")).toBeNull();
    expect(demoTokenFromSetCookie("xpcobooster-demo=abc")).toBeNull();
    expect(demoTokenFromSetCookie(null)).toBeNull();
  });
});
