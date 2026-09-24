import { createFileRoute } from "@tanstack/react-router";

import { marketingPageHandlers } from "@/server/marketing-page";

export const Route = createFileRoute("/about")({
  server: { handlers: marketingPageHandlers("/marketing/about.html") },
});
