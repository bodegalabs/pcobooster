import { env } from "cloudflare:workers";

import { serveStaticPage } from "@/server/passthrough";

const methodNotAllowed = (): Response =>
  new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });

/**
 * Server-route handlers for a prerendered marketing page staged in `public/marketing`
 * (`scripts/stage-marketing.ts`). HEAD falls back to GET.
 */
export const marketingPageHandlers = (assetPath: string) => ({
  GET: async ({ request }: { request: Request }) =>
    await serveStaticPage(env.ASSETS, request, assetPath),
  ANY: methodNotAllowed,
});
