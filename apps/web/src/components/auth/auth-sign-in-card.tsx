import { captureAnalytics } from "@pcobooster/analytics/client";
import { X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { preconnect } from "react-dom";

import { BrandRocketLogo } from "@/components/brand-rocket-logo";
import { PlanningCenterServicesIcon } from "@/components/planning-center-services-icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { useBrowserStorage } from "@/hooks/use-browser-storage";
import { authClient } from "@/lib/auth-client";
import { SIGN_IN_RETURN_PARAM } from "@/lib/auth-redirect";
import {
  ROCKET_ANIMATION,
  canPlayRocketHoverAnimation,
  playRocketAnimation,
} from "@/lib/brand-rocket-animation";
import {
  REMEMBERED_ACCOUNTS_KEY,
  forgetRememberedAccount,
  parseRememberedAccounts,
} from "@/lib/remembered-accounts";
import type { RememberedAccount } from "@/lib/remembered-accounts";

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
  return new URL(
    `/auth?${params.toString()}`,
    window.location.origin
  ).toString();
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

const WHITESPACE = /\s+/u;

const accountInitials = (account: RememberedAccount): string => {
  const source = account.name.trim() || account.email.trim();
  const [first = "", second = ""] = source.split(WHITESPACE);
  const initials =
    second === "" ? first.slice(0, 2) : `${first[0]}${second[0]}`;
  return initials.toUpperCase() || "?";
};

const RememberedAccountRow = ({
  account,
  pending,
  disabled,
  onSelect,
  onForget,
  onIntent,
}: {
  account: RememberedAccount;
  pending: boolean;
  disabled: boolean;
  onSelect: () => void;
  onForget: () => void;
  onIntent: () => void;
}) => {
  const displayName = account.name.trim() || account.email;
  const detail = account.organizationName ?? account.email;
  return (
    <li className="relative">
      <Item
        variant="outline"
        size="xs"
        className="pr-11"
        render={
          <button
            type="button"
            aria-label={`Continue as ${displayName}`}
            aria-busy={pending}
            disabled={disabled}
          />
        }
        onPointerEnter={onIntent}
        onFocus={onIntent}
        onClick={onSelect}
      >
        <ItemMedia>
          <Avatar>
            {account.image === null ? null : (
              <AvatarImage src={account.image} alt="" />
            )}
            <AvatarFallback>{accountInitials(account)}</AvatarFallback>
          </Avatar>
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle>{displayName}</ItemTitle>
          <ItemDescription>{detail}</ItemDescription>
        </ItemContent>
        {pending ? <Spinner /> : null}
      </Item>
      {pending ? null : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-1/2 right-1.5 -translate-y-1/2"
          aria-label={`Remove ${displayName} from this device`}
          disabled={disabled}
          onClick={onForget}
        >
          <X />
        </Button>
      )}
    </li>
  );
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
  // Which quick-access account started the redirect; null for the main button.
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [rememberedRaw] = useBrowserStorage(REMEMBERED_ACCOUNTS_KEY);
  const rememberedAccounts = parseRememberedAccounts(rememberedRaw);
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

  const handleSignIn = async (userId: string | null = null) => {
    if (redirecting) {
      return;
    }
    setSignInError("");
    setRedirecting(true);
    setPendingUserId(userId);
    captureAnalytics("sign in started");

    try {
      const url = await prepareAuthorization();
      // Keep the pending state until the browser leaves the page.
      window.location.assign(url);
    } catch (error) {
      captureAnalytics("sign in failed");
      setSignInError(
        error instanceof Error ? error.message : START_SIGN_IN_ERROR
      );
      setRedirecting(false);
      setPendingUserId(null);
    }
  };

  // Returning with the back button restores this page from the bfcache with
  // the pending state still set; reset it and discard the spent OAuth state.
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        preparedRef.current = null;
        setRedirecting(false);
        setPendingUserId(null);
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  const hasRemembered = rememberedAccounts.length > 0;
  const mainButtonLabel =
    redirecting && pendingUserId === null
      ? "Opening Planning Center…"
      : "Continue with Planning Center";

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
                  {hasRemembered ? "Welcome back" : "Sign in"}
                </h1>
                <p className="text-muted-foreground text-pretty">
                  {hasRemembered
                    ? "Pick up where you left off on this device."
                    : "Plan services and schedule your team with your Planning Center account."}
                </p>
              </div>

              {signInError === "" ? null : (
                <Alert variant="destructive" aria-live="polite">
                  <AlertDescription>{signInError}</AlertDescription>
                </Alert>
              )}

              {hasRemembered ? (
                <ul
                  className="flex flex-col gap-2"
                  aria-label="Recent accounts"
                >
                  {rememberedAccounts.map((account) => (
                    <RememberedAccountRow
                      key={account.userId}
                      account={account}
                      pending={pendingUserId === account.userId}
                      disabled={redirecting}
                      onIntent={() => {
                        void warmAuthorization();
                      }}
                      onSelect={() => {
                        void handleSignIn(account.userId);
                      }}
                      onForget={() => {
                        forgetRememberedAccount(account.userId);
                      }}
                    />
                  ))}
                </ul>
              ) : null}

              <Button
                type="button"
                size="lg"
                variant={hasRemembered ? "outline" : "default"}
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
                {redirecting && pendingUserId === null ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <PlanningCenterServicesIcon
                    data-icon="inline-start"
                    className="size-5"
                  />
                )}
                {mainButtonLabel}
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
