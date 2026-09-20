/** Public marketing routes and the generated static export, never product APIs. */
export const isPublicPath = (pathname: string): boolean =>
  pathname === "/" ||
  pathname === "/about" ||
  pathname === "/about/" ||
  pathname.startsWith("/marketing/");
