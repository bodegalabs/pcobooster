import { createFileRoute } from "@tanstack/react-router";

import { marketingPageHandlers } from "@/server/marketing-page";

export const Route = createFileRoute("/")({
  server: { handlers: marketingPageHandlers("/marketing/index.html") },
});
