import { describe, expect, it } from "vitest";

import { isPublicPath } from "./public-paths";

describe("public marketing routes", () => {
  it.each([
    "/",
    "/about",
    "/about/",
    "/marketing/_next/static/site.js",
    "/marketing/screenshots/assign.webp",
  ])("allows %s without a session", (pathname) => {
    expect(isPublicPath(pathname)).toBeTruthy();
  });

  it.each([
    "/services",
    "/people",
    "/api/rpc/people/list",
    "/api/auth/get-session",
    "/about-team",
    "/marketing-private",
    "/marketing",
  ])("does not exempt %s from product authentication", (pathname) => {
    expect(isPublicPath(pathname)).toBeFalsy();
  });
});
