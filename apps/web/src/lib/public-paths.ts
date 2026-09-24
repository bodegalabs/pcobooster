/** Public marketing pages and their prerendered assets, never product APIs. */
export const isPublicPath = (pathname: string): boolean =>
  pathname === "/" ||
  pathname === "/about" ||
  pathname === "/about/" ||
  pathname === "/robots.txt" ||
  pathname === "/sitemap.xml" ||
  pathname.startsWith("/marketing/");
