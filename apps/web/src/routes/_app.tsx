import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { peopleFeatureQueryOptions } from "@/lib/people-route";

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
  // The navigation shows People only when the flag is on. Loading the answer here renders
  // the server HTML with it, so the link never flashes.
  loader: async ({ context }) => {
    try {
      await context.queryClient.query(peopleFeatureQueryOptions);
    } catch {
      // The link stays hidden; the page itself does not depend on the answer.
    }
  },
  headers: () => ({ "Cache-Control": "private, no-store" }),
  // Not-found pages bubble to the root, which renders them inside the shell.
  component: AppLayout,
});
