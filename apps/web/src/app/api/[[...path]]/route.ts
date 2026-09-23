import { getWorkerEnvironment } from "@/lib/cloudflare";

const forward = async (request: Request): Promise<Response> =>
  await getWorkerEnvironment().API.fetch(request.url, {
    method: request.method,
    headers: Object.fromEntries(request.headers),
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer(),
    redirect: "manual",
    signal: request.signal,
  });

export {
  forward as GET,
  forward as POST,
  forward as PUT,
  forward as PATCH,
  forward as DELETE,
  forward as OPTIONS,
  forward as HEAD,
};
