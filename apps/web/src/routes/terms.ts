import { createFileRoute } from "@tanstack/react-router";

import { marketingPageHandlers } from "@/server/marketing-page";

export const Route = createFileRoute("/terms")({
  server: { handlers: marketingPageHandlers("/marketing/terms.html") },
});
