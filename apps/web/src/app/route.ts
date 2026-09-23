import { getWorkerEnvironment } from "@/lib/cloudflare";

export const GET = async (request: Request): Promise<Response> => {
  const assets = getWorkerEnvironment().ASSETS;
  if (assets === undefined) {
    throw new Error("Cloudflare assets binding is missing");
  }
  return await assets.fetch(
    new URL("/marketing/index.html", request.url).toString()
  );
};

export { GET as HEAD };
