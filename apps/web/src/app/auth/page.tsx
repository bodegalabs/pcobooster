import { redirect } from "next/navigation";

import { getSessionStatus } from "@/server/api";

import { AuthSignInCard } from "./auth-sign-in-card";

const AuthPage = async () => {
  const { authenticated } = await getSessionStatus();
  if (authenticated) {
    redirect("/services");
  }
  return <AuthSignInCard />;
};

export default AuthPage;
