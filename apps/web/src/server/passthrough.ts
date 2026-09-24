import type { ServiceFetcher } from "@/server/server-rpc";

/**
 * Hands a request to another Worker unchanged: method, URL, headers, and the streaming body.
 * Redirects go back to the browser, as they would without the product in front.
 */
export const forwardRequest = async (
  service: ServiceFetcher,
  request: Request
): Promise<Response> =>
  await service.fetch(new Request(request, { redirect: "manual" }));

/** Serves a static HTML file from the Worker's assets at a route that is not its path. */
export const serveStaticPage = async (
  assets: ServiceFetcher,
  request: Request,
  assetPath: string
): Promise<Response> =>
  await assets.fetch(new Request(new URL(assetPath, request.url)));
