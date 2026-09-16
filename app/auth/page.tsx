import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";

import { AuthSignInCard } from "./auth-sign-in-card";

const AuthPage = async () => {
  if (isDevAuthBypassEnabled()) {
    redirect("/");
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (session !== null) {
    redirect("/");
  }
  return <AuthSignInCard />;
};

export default AuthPage;
