import { describe, expect, it } from "vitest";

import { isPublicPath } from "./public-paths";

describe("public marketing routes", () => {
  it.each([
    "/",
    "/about",
    "/about/",
    "/privacy",
    "/privacy/",
    "/terms",
    "/terms/",
    "/key-transitions",
    "/key-transitions/",
    "/key-transitions/g-to-b-flat",
    "/key-transitions/c-sharp-minor-to-e/",
    "/robots.txt",
    "/sitemap.xml",
    "/version",
    "/marketing/assets/index.js",
    "/marketing/screenshots/assign.webp",
  ])("allows %s without a session", (pathname) => {
    expect(isPublicPath(pathname)).toBeTruthy();
  });

  it.each([
    "/services",
    "/people",
    "/api/v1/people",
    "/api/auth/get-session",
    "/about-team",
    "/key-transitions-private",
    "/key-transitions/g-to-b-flat/notes",
    "/marketing-private",
    "/marketing",
    "/versions",
  ])("does not exempt %s from product authentication", (pathname) => {
    expect(isPublicPath(pathname)).toBeFalsy();
  });
});
