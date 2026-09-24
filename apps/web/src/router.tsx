import { QueryClient, hashKey } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { INTENT_PREFETCH_DWELL_MS } from "@/lib/intent-prefetch";
import { parseSearch, stringifySearch } from "@/lib/search-params";
import { routeTree } from "@/routeTree.gen";

const QUERY_GC_TIME_MS = 30 * 60 * 1000;

/**
 * Presentation mode renders fictional data, so its queries live in their own namespace and
 * never mix with live data from the same browser.
 */
const createQueryClient = (presentationScope: string): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: QUERY_GC_TIME_MS,
        queryKeyHashFn: (queryKey) => hashKey([presentationScope, ...queryKey]),
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

/** Start creates a router, and so a query client, for each server request. */
export const getRouter = () => {
  const queryClient = createQueryClient(
    import.meta.env.VITE_PRESENTATION_SCOPE
  );
  const router = createRouter({
    routeTree,
    context: { queryClient },
    parseSearch,
    stringifySearch,
    defaultPreload: "intent",
    // Links preload after the same dwell as row prefetches, so passing the pointer over
    // a link never preloads it. Route loaders fetch no Planning Center data today.
    defaultPreloadDelay: INTENT_PREFETCH_DWELL_MS,
    // Query owns data freshness; preloading only warms route code.
    defaultPreloadStaleTime: 0,
    // Show route skeletons as soon as a navigation waits.
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    scrollRestoration: true,
  });
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
};
