import { env } from "cloudflare:workers";

import { serveStaticPage } from "@/server/passthrough";

const methodNotAllowed = (): Response =>
  new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });

const PAGE_SLUG = /^[a-z0-9-]+$/u;

/**
 * Server-route handlers for a prerendered marketing page staged in `public/marketing`
 * (`scripts/stage-marketing.ts`). HEAD falls back to GET.
 */
export const marketingPageHandlers = (assetPath: string) => ({
  GET: async ({ request }: { request: Request }) =>
    await serveStaticPage(env.ASSETS, request, assetPath),
  ANY: methodNotAllowed,
});

/**
 * The same for a dynamic route whose slug names the file, such as one key change page. Only
 * plain slugs reach the assets; an unknown one is a missing file, so a 404.
 */
export const marketingSlugPageHandlers = (
  assetPathOf: (slug: string) => string
) => ({
  GET: async ({
    request,
    params,
  }: {
    request: Request;
    params: { slug: string };
  }) =>
    PAGE_SLUG.test(params.slug)
      ? await serveStaticPage(env.ASSETS, request, assetPathOf(params.slug))
      : new Response(null, { status: 404 }),
  ANY: methodNotAllowed,
});
