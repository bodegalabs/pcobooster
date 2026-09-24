import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import { withoutPublicBase } from "./lib/base-path";

/** Only prerendering and `vite preview` run this server; the deployed site is static files. */
export default createServerEntry({
  fetch: async (request, options) => {
    const url = new URL(request.url);
    const path = `${url.pathname}${url.search}`;
    const routedPath = withoutPublicBase(path, import.meta.env.BASE_URL);
    if (routedPath === path) {
      return await handler.fetch(request, options);
    }
    return await handler.fetch(
      new Request(new URL(routedPath, url.origin), request),
      options
    );
  },
});
