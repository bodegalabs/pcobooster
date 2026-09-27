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
