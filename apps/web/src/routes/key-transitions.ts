import { createFileRoute } from "@tanstack/react-router";

import { marketingPageHandlers } from "@/server/marketing-page";

export const Route = createFileRoute("/key-transitions")({
  server: {
    handlers: marketingPageHandlers("/marketing/key-transitions.html"),
  },
});
