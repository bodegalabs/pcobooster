import { httpClientFor } from "@pcobooster/api/testing/http-client";
import { testRuntime } from "@pcobooster/api/testing/runtime";

import type { ServerApp } from "./app";

export interface TestServerApp {
  readonly request: (
    input: string | Request,
    init?: RequestInit
  ) => Promise<Response>;
}

/**
 * Serves a test app as the Worker does, handing every request its own runtime. Planning Center
 * calls read the global `fetch` when sent, so a test's stub sees them.
 */
export const serveForTest = (app: ServerApp): TestServerApp => {
  const runtime = testRuntime(
    httpClientFor(async (input, init) => await globalThis.fetch(input, init))
  );
  return {
    request: async (input, init) => await app.request(input, init, { runtime }),
  };
};
