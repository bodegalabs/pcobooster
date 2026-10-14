import { createFileRoute } from "@tanstack/react-router";

import { marketingSlugPageHandlers } from "@/server/marketing-page";

/** One prerendered page per key change, such as `/key-transitions/g-to-b-flat`. */
export const Route = createFileRoute("/key-transitions_/$slug")({
  server: {
    handlers: marketingSlugPageHandlers(
      (slug) => `/marketing/key-transitions/${slug}.html`
    ),
  },
});
