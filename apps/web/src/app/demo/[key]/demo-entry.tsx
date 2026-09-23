"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { BrandRocketLogo } from "@/components/brand-rocket-logo";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { clearAccountScopedCaches } from "@/lib/account-scoped-caches";
import { DEFAULT_SIGN_IN_RETURN_PATH } from "@/lib/auth-redirect";
import { ROCKET_ANIMATION } from "@/lib/brand-rocket-animation";
import { orpc } from "@/orpc-client";

type DemoEntryState = "starting" | "launching" | "inactive";

/** Trades the link key for a demo session cookie, then opens the app. */
export const DemoEntry = ({ demoKey }: { demoKey: string }) => {
  const maskId = useId().replaceAll(":", "");
  const [state, setState] = useState<DemoEntryState>("starting");

  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        await orpc.demo.start({ key: demoKey });
      } catch {
        if (active) {
          setState("inactive");
        }
        return;
      }
      if (!active) {
        return;
      }
      // Anything cached from a signed-in organization must not leak into the
      // demo, so forget it and boot the app fresh; replacing also drops the
      // key from history.
      clearAccountScopedCaches();
      setState("launching");
      window.location.replace(DEFAULT_SIGN_IN_RETURN_PATH);
    };
    void start();
    return () => {
      active = false;
    };
  }, [demoKey]);

  return (
    <main className="auth-backdrop flex min-h-svh items-center justify-center px-4 py-12">
      <div className="auth-stagger flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl tracking-tight">
            <strong className="font-bold">PCO</strong>Booster
          </span>
          <div
            aria-hidden
            data-launching={state === "launching" ? "" : undefined}
            className={`auth-rocket size-10 ${ROCKET_ANIMATION.takeoff.className}`}
          >
            <BrandRocketLogo maskId={maskId} />
          </div>
        </div>

        {state === "inactive" ? (
          <Card className="w-full">
            <CardContent>
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1.5 text-center">
                  <h1 className="font-heading text-xl font-semibold tracking-tight">
                    This demo link isn’t active
                  </h1>
                  <p className="text-muted-foreground text-pretty">
                    Ask whoever shared it for a new link, or sign in with your
                    own Planning Center account.
                  </p>
                </div>
                <Link
                  href="/auth"
                  className={buttonVariants({
                    size: "lg",
                    className: "w-full",
                  })}
                >
                  Sign in
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <p
            aria-live="polite"
            className="text-muted-foreground flex items-center gap-2 text-sm"
          >
            <Spinner />
            Opening the demo…
          </p>
        )}
      </div>
    </main>
  );
};
