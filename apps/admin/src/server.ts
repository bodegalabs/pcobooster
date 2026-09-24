import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import { withMountTrailingSlash } from "@/lib/base-path";

export default createServerEntry({
  fetch: async (request, options) => {
    const url = new URL(request.url);
    const path = `${url.pathname}${url.search}`;
    const servedPath = withMountTrailingSlash(path, import.meta.env.BASE_URL);
    if (servedPath === path) {
      return await handler.fetch(request, options);
    }
    return await handler.fetch(
      new Request(new URL(servedPath, url.origin), request),
      options
    );
  },
});
