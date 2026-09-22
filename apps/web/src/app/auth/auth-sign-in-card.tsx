"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { preconnect } from "react-dom";

import { BrandRocketLogo } from "@/components/brand-rocket-logo";
import { PlanningCenterServicesIcon } from "@/components/planning-center-services-icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { SIGN_IN_RETURN_PARAM } from "@/lib/auth-redirect";
import {
  ROCKET_ANIMATION,
  canPlayRocketHoverAnimation,
  playRocketAnimation,
} from "@/lib/brand-rocket-animation";

const PLANNING_CENTER_ORIGINS = [
  "https://api.planningcenteronline.com",
  "https://login.planningcenteronline.com",
] as const;

const START_SIGN_IN_ERROR = "Unable to start sign in. Please try again.";

/** Better Auth keeps OAuth state for 10 minutes; refresh well before that. */
const PREPARED_URL_MAX_AGE_MS = 5 * 60 * 1000;

interface PreparedAuthorization {
  createdAt: number;
  url: Promise<string>;
}

const buildErrorCallbackUrl = (returnPath: string): string => {
  const params = new URLSearchParams({ [SIGN_IN_RETURN_PARAM]: returnPath });
  return `/auth?${params.toString()}`;
};

const requestAuthorizationUrl = async (returnPath: string): Promise<string> => {
  const result = await authClient.signIn.social({
    provider: "planning-center",
    callbackURL: returnPath,
    errorCallbackURL: buildErrorCallbackUrl(returnPath),
    disableRedirect: true,
  });
  if (result.error) {
    throw new Error(result.error.message ?? START_SIGN_IN_ERROR);
  }
  const url = result.data?.url;
  if (url === undefined || url === "") {
    throw new Error(START_SIGN_IN_ERROR);
  }
  return url;
};

export const AuthSignInCard = ({
  returnPath,
  initialError,
}: {
  returnPath: string;
  initialError: string | null;
}) => {
  const [signInError, setSignInError] = useState(initialError ?? "");
  const [redirecting, setRedirecting] = useState(false);
  const preparedRef = useRef<PreparedAuthorization | null>(null);
  const maskId = useId().replaceAll(":", "");
  const rocketRef = useRef<HTMLDivElement>(null);
  const replayCleanupRef = useRef<(() => void) | null>(null);

  // Same hover flourish as the sidebar brand mark; the page-load takeoff is
  // server-rendered so it plays with the first paint.
  const replayRocket = useCallback(() => {
    const rocket = rocketRef.current;
    if (rocket === null || !canPlayRocketHoverAnimation()) {
      return;
    }
    replayCleanupRef.current?.();
    replayCleanupRef.current = playRocketAnimation(rocket, "replay");
  }, []);

  useEffect(
    () => () => {
      replayCleanupRef.current?.();
    },
    []
  );

  for (const origin of PLANNING_CENTER_ORIGINS) {
    preconnect(origin);
  }

  // Start the OAuth handshake on intent (hover, focus, press) so the
  // Planning Center URL is usually ready by the time the click lands.
  const prepareAuthorization = useCallback(async (): Promise<string> => {
    const cached = preparedRef.current;
    const prepared =
      cached !== null && Date.now() - cached.createdAt < PREPARED_URL_MAX_AGE_MS
        ? cached
        : { createdAt: Date.now(), url: requestAuthorizationUrl(returnPath) };
    preparedRef.current = prepared;

    try {
      return await prepared.url;
    } catch (error) {
      // Never reuse a failed handshake; the next attempt starts fresh.
      if (preparedRef.current === prepared) {
        preparedRef.current = null;
      }
      throw error;
    }
  }, [returnPath]);

  const warmAuthorization = useCallback(async () => {
    try {
      await prepareAuthorization();
    } catch {
      // Surfaced on click instead, where the visitor expects feedback.
    }
  }, [prepareAuthorization]);

  const handleSignIn = async () => {
    if (redirecting) {
      return;
    }
    setSignInError("");
    setRedirecting(true);

    try {
      const url = await prepareAuthorization();
      // Keep the pending state until the browser leaves the page.
      window.location.assign(url);
    } catch (error) {
      setSignInError(
        error instanceof Error ? error.message : START_SIGN_IN_ERROR
      );
      setRedirecting(false);
    }
  };

  // Returning with the back button restores this page from the bfcache with
  // the pending state still set; reset it and discard the spent OAuth state.
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        preparedRef.current = null;
        setRedirecting(false);
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return (
    <main className="auth-backdrop flex min-h-svh items-center justify-center px-4 py-12">
      <div className="auth-stagger flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex items-center gap-2.5" onMouseEnter={replayRocket}>
          <span className="text-2xl tracking-tight">
            <strong className="font-bold">PCO</strong>Booster
          </span>
          <div
            ref={rocketRef}
            aria-hidden
            data-launching={redirecting ? "" : undefined}
            className={`auth-rocket size-10 ${ROCKET_ANIMATION.takeoff.className}`}
          >
            <BrandRocketLogo maskId={maskId} />
          </div>
        </div>

        <Card className="w-full">
          <CardContent>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-1.5 text-center">
                <h1 className="font-heading text-xl font-semibold tracking-tight">
                  Sign in
                </h1>
                <p className="text-muted-foreground text-pretty">
                  Plan services and schedule your team with your Planning Center
                  account.
                </p>
              </div>

              {signInError === "" ? null : (
                <Alert variant="destructive" aria-live="polite">
                  <AlertDescription>{signInError}</AlertDescription>
                </Alert>
              )}

              <Button
                type="button"
                size="lg"
                className="w-full"
                aria-busy={redirecting}
                disabled={redirecting}
                onPointerEnter={() => {
                  replayRocket();
                  void warmAuthorization();
                }}
                onFocus={() => {
                  void warmAuthorization();
                }}
                onClick={() => {
                  void handleSignIn();
                }}
              >
                {redirecting ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <PlanningCenterServicesIcon
                    data-icon="inline-start"
                    className="size-5"
                  />
                )}
                {redirecting
                  ? "Opening Planning Center…"
                  : "Continue with Planning Center"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-muted-foreground max-w-xs text-center text-xs text-pretty">
          You’ll sign in on Planning Center, then come right back here.
          PCOBooster only uses your Services and People access.
        </p>
      </div>
    </main>
  );
};
