import { createFileRoute } from "@tanstack/react-router";

import { marketingPageHandlers } from "@/server/marketing-page";

/** The marketing build writes the sitemap, since it knows every page it prerendered. */
export const Route = createFileRoute("/sitemap.xml")({
  server: { handlers: marketingPageHandlers("/marketing/sitemap.xml") },
});
