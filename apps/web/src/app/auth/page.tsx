import { getSessionCookie } from "better-auth/cookies";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  SIGN_IN_RETURN_PARAM,
  describeSignInError,
  sanitizeReturnPath,
} from "@/lib/auth-redirect";
import { getSessionStatus } from "@/server/api";

import { AuthSignInCard } from "./auth-sign-in-card";

export const metadata: Metadata = {
  title: "Sign in · worshipadmin.com",
};

type SearchParamValue = string | string[] | undefined;

interface AuthPageProps {
  searchParams: Promise<Record<string, SearchParamValue>>;
}

/** Repeated query keys are ambiguous, so only a single value is honored. */
const singleQueryValue = (value: SearchParamValue): string | null =>
  Array.isArray(value) ? null : (value ?? null);

const AuthPage = async ({ searchParams }: AuthPageProps) => {
  const query = await searchParams;
  const returnPath = sanitizeReturnPath(
    singleQueryValue(query[SIGN_IN_RETURN_PARAM])
  );

  // Signed-out visitors have no session cookie, so skip the API round trip
  // and render the sign-in screen immediately.
  const hasSessionCookie = getSessionCookie(await headers()) !== null;
  if (hasSessionCookie) {
    const { authenticated } = await getSessionStatus();
    if (authenticated) {
      redirect(returnPath);
    }
  }

  return (
    <AuthSignInCard
      returnPath={returnPath}
      initialError={describeSignInError(singleQueryValue(query.error))}
    />
  );
};

export default AuthPage;
