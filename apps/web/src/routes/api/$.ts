import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { forwardRequest } from "@/server/passthrough";

/** Better Auth, oRPC, and the rest of the API live in the API Worker. */
export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      ANY: async ({ request }) => await forwardRequest(env.API, request),
    },
  },
});
