import { getCloudflareContext } from "@opennextjs/cloudflare";

declare global {
  interface CloudflareEnv {
    API: { fetch: (url: string, init?: RequestInit) => Promise<Response> };
    ADMIN: { fetch: (url: string, init?: RequestInit) => Promise<Response> };
    PRODUCT_ORIGIN: string;
  }
}

interface WorkerEnvironment {
  API: { fetch: (url: string, init?: RequestInit) => Promise<Response> };
  ADMIN: { fetch: (url: string, init?: RequestInit) => Promise<Response> };
  PRODUCT_ORIGIN: string;
  ASSETS?: { fetch: (url: string) => Promise<Response> };
}

export const getWorkerEnvironment = (): WorkerEnvironment =>
  getCloudflareContext().env;
