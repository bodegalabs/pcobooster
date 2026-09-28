import { createFileRoute } from "@tanstack/react-router";

import { marketingPageHandlers } from "@/server/marketing-page";

export const Route = createFileRoute("/privacy")({
  server: { handlers: marketingPageHandlers("/marketing/privacy.html") },
});
