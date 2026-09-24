import { createFileRoute, redirect } from "@tanstack/react-router";

import { AuthSignInCard } from "@/components/auth/auth-sign-in-card";
import { describeSignInError, sanitizeReturnPath } from "@/lib/auth-redirect";
import { authSearchSchema } from "@/lib/route-search";
import { getSessionStatus } from "@/server/session.functions";

const AuthPage = () => {
  const { returnPath } = Route.useRouteContext();
  const { error } = Route.useSearch();
  return (
    <AuthSignInCard
      returnPath={returnPath}
      initialError={describeSignInError(error ?? null)}
    />
  );
};

export const Route = createFileRoute("/auth")({
  validateSearch: authSearchSchema,
  beforeLoad: async ({ search }) => {
    const returnPath = sanitizeReturnPath(search.next ?? null);
    const { authenticated } = await getSessionStatus();
    if (authenticated) {
      // The return path may be outside this router, such as `/admin`.
      redirect({ href: returnPath, reloadDocument: true, throw: true });
    }
    return { returnPath };
  },
  head: () => ({ meta: [{ title: "Sign in · PCOBooster" }] }),
  headers: () => ({ "Cache-Control": "private, no-store" }),
  component: AuthPage,
});
