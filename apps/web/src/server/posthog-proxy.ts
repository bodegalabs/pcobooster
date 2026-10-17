/** Only these paths belong to the analytics proxy; similarly named app routes do not. */
export const isPostHogProxyPath = (pathname: string): boolean =>
  pathname.startsWith("/ingest/");

/** Fixed upstream origins prevent the public proxy from forwarding to arbitrary hosts. */
export const proxyPostHog = async (
  request: Request,
  upstreamFetch: (request: Request) => Promise<Response> = fetch
): Promise<Response> => {
  const url = new URL(request.url);
  const upstream = new URL(
    url.pathname.startsWith("/ingest/static/")
      ? "https://us-assets.i.posthog.com"
      : "https://us.i.posthog.com"
  );
  upstream.pathname = url.pathname.slice("/ingest".length);
  upstream.search = url.search;

  const headers = new Headers(request.headers);
  headers.set("Host", upstream.host);
  headers.delete("Cookie");
  headers.delete("Authorization");
  headers.delete("X-Forwarded-For");
  const clientIp = request.headers.get("CF-Connecting-IP");
  if (clientIp !== null) {
    headers.set("X-Forwarded-For", clientIp);
  }

  const forwarded = new Request(upstream, request);
  const response = await upstreamFetch(
    new Request(forwarded, {
      headers,
      redirect: "manual",
      // Never let collection responses enter a cache, including POST responses.
      cache: "no-store",
    })
  );
  const result = new Response(response.body, response);
  result.headers.delete("Set-Cookie");
  if (request.method !== "GET" && request.method !== "HEAD") {
    result.headers.set("Cache-Control", "no-store");
  }
  return result;
};
