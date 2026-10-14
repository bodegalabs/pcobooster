/**
 * Public marketing pages, their prerendered assets, and the deployed version, never product
 * APIs.
 */
export const isPublicPath = (pathname: string): boolean =>
  pathname === "/" ||
  pathname === "/about" ||
  pathname === "/about/" ||
  pathname === "/privacy" ||
  pathname === "/privacy/" ||
  pathname === "/terms" ||
  pathname === "/terms/" ||
  pathname === "/key-transitions" ||
  pathname === "/key-transitions/" ||
  pathname === "/robots.txt" ||
  pathname === "/sitemap.xml" ||
  pathname === "/version" ||
  pathname.startsWith("/marketing/");
