import { describe, expect, it } from "vitest";

import { accessViewerEmail } from "./access-viewer";

interface TestClaims {
  readonly email?: string;
  readonly sub?: string;
}

const jwtWith = (claims: TestClaims) =>
  `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;

describe(accessViewerEmail, () => {
  it("prefers the email header Access sets", () => {
    expect(
      accessViewerEmail({
        email: "owner@example.com",
        jwt: jwtWith({ email: "other@x.io" }),
      })
    ).toBe("owner@example.com");
  });

  it("reads the email from the Access JWT when the header is absent", () => {
    expect(
      accessViewerEmail({ jwt: jwtWith({ email: "owner@example.com" }) })
    ).toBe("owner@example.com");
  });

  it("returns null without Access or with an unreadable token", () => {
    expect(accessViewerEmail({})).toBeNull();
    expect(accessViewerEmail({ jwt: "not-a-jwt" })).toBeNull();
    expect(accessViewerEmail({ jwt: jwtWith({ sub: "x" }) })).toBeNull();
  });
});
