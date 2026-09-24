import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { forwardRequest } from "@/server/passthrough";

/**
 * Outside production the admin app lives under the product's `/admin`. Both `/admin` and
 * `/admin/` pass through unchanged; the admin Worker serves either as its index.
 */
export const Route = createFileRoute("/admin/$")({
  server: {
    handlers: {
      ANY: async ({ request }) => await forwardRequest(env.ADMIN, request),
    },
  },
});
