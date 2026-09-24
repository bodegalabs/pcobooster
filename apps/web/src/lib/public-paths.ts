/** Public marketing pages and their prerendered assets, never product APIs. */
export const isPublicPath = (pathname: string): boolean =>
  pathname === "/" ||
  pathname === "/about" ||
  pathname === "/about/" ||
  pathname.startsWith("/marketing/");
