import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { featuresQueryOptions } from "@/lib/features";

const AppLayout = () => (
  <AppShell>
    <Outlet />
  </AppShell>
);

/**
 * Signed-in product pages. The shell renders on the server; each page renders in the
 * browser from its query caches, with its skeleton as the server fallback.
 */
export const Route = createFileRoute("/_app")({
  // The navigation shows People and Songs only when their flags are on.
  // Loading the answers here renders the server HTML with them, so the links never flash.
  loader: async ({ context }) => {
    try {
      await context.queryClient.query(featuresQueryOptions);
    } catch {
      // A failed answer keeps flagged links hidden; the pages do not depend on it.
    }
  },
  headers: () => ({ "Cache-Control": "private, no-store" }),
  // Not-found pages bubble to the root, which renders them inside the shell.
  component: AppLayout,
});
