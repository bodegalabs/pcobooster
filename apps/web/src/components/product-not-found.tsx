import { Link } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { PageShell } from "@/components/page-shell";
import { buttonVariants } from "@/components/ui/button-variants";

const NotFoundContent = () => (
  <PageShell layout="center">
    <h1 className="text-xl font-semibold">Page not found</h1>
    <p className="text-muted-foreground text-sm">
      This page doesn’t exist, or it isn’t available to you.
    </p>
    <Link to="/services" className={buttonVariants()}>
      Go to Services
    </Link>
  </PageShell>
);

/** Unknown product URLs keep the app's navigation. */
export const ProductNotFound = () => (
  <AppShell>
    <NotFoundContent />
  </AppShell>
);
