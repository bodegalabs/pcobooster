/**
 * Marketing pages route at `/` and `/about` while every asset lives under the Vite `base`
 * (`/marketing/`). Start's dev server reconciles the two itself; its preview server, which
 * prerendering fetches pages through, does not. These helpers bridge the gap there.
 */

/** Page URLs outside the base get it prepended so Vite's preview base guard accepts them. */
export const withPublicBase = (url: string, base: string): string =>
  url.startsWith(base) ? url : `${base.slice(0, -1)}${url}`;

/** Start's preview handler re-prefixes the base; the router expects the bare page path. */
export const withoutPublicBase = (url: string, base: string): string =>
  url.startsWith(base) ? url.slice(base.length - 1) : url;
