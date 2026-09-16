import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import {
  getDevBypassSession,
  isDevAuthBypassEnabled,
  loadDevBypassIdentity,
} from "@/lib/auth/dev-bypass";
import { isAdminEmail } from "@/lib/use-cases/admin/get-account-activity";

export const requireAdminSession = async () => {
  const session = isDevAuthBypassEnabled()
    ? getDevBypassSession(await loadDevBypassIdentity())
    : await auth.api.getSession({
        headers: await headers(),
      });

  if (!session) {
    redirect("/auth");
  }

  if (!isAdminEmail(session.user.email)) {
    notFound();
  }

  return session;
};
