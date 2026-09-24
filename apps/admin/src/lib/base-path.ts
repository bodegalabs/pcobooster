/**
 * Vite `base` for the admin app. Non-production stages serve it through the product's
 * `/admin` route, and production owns `admin.pcobooster.com` at the root. An explicit
 * `ADMIN_BASE_PATH` (set by `alchemy.run.ts` and CI) wins; otherwise the dev server
 * matches `bun run dev`, and builds (and `vite preview`) default to the production root.
 */
export const resolveAdminBase = (
  basePath: string | undefined,
  devServer: boolean
): string => `${basePath ?? (devServer ? "/admin" : "")}/`;

/**
 * Product sign-in URL for a signed-out admin request. When the admin app lives under the
 * product origin, sign-in returns there; the admin subdomain is not a product return path.
 */
export const productSignInUrl = (
  productOrigin: string,
  adminBase: string
): string => {
  const destination = new URL("/auth", productOrigin);
  const mountPath = adminBase.replace(/\/$/u, "");
  if (mountPath !== "") {
    destination.searchParams.set("next", mountPath);
  }
  return destination.toString();
};
