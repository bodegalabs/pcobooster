/**
 * Public marketing pages, assets, Apple app-link association and deployed version.
 * Product operations keep their authentication boundary.
 */
export const isPublicPath = (pathname: string): boolean =>
  pathname === "/" ||
  pathname === "/about" ||
  pathname === "/about/" ||
  pathname === "/privacy" ||
  pathname === "/privacy/" ||
  pathname === "/terms" ||
  pathname === "/terms/" ||
  pathname === "/robots.txt" ||
  pathname === "/sitemap.xml" ||
  pathname === "/version" ||
  pathname === "/.well-known/apple-app-site-association" ||
  pathname.startsWith("/marketing/");
