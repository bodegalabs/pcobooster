import { redirect } from "next/navigation";

import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";

import { AuthSignInCard } from "./auth-sign-in-card";

export default function AuthPage() {
  if (isDevAuthBypassEnabled()) {
    redirect("/");
  }
  return <AuthSignInCard />;
}
