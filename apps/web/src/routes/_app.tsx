import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";

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
  headers: () => ({ "Cache-Control": "private, no-store" }),
  // Not-found pages bubble to the root, which renders them inside the shell.
  component: AppLayout,
});
