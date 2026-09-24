import {
  ArrowRight01Icon,
  Layout3ColumnIcon,
  ListMusicIcon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";

import { BrandRocketLogo } from "@/components/brand-rocket-logo";
import { SidebarNavIcon } from "@/components/sidebar-nav-icon";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { clearAccountScopedCaches } from "@/lib/account-scoped-caches";
import { DEFAULT_SIGN_IN_RETURN_PATH } from "@/lib/auth-redirect";
import { ROCKET_ANIMATION } from "@/lib/brand-rocket-animation";
import { orpc } from "@/orpc-client";

type DemoEntryState = "starting" | "ready" | "launching" | "inactive";

interface DemoHighlight {
  readonly title: string;
  readonly description: string;
  readonly icon: IconSvgElement;
}

const highlights: readonly DemoHighlight[] = [
  {
    title: "Assign",
    description:
      "Pick an open position and see who’s available, rested, and a good fit.",
    icon: UserAdd01Icon,
  },
  {
    title: "Lineup",
    description: "Every team’s filled and open roles for a service.",
    icon: Layout3ColumnIcon,
  },
  {
    title: "Plan",
    description: "The run sheet, with songs, keys, and arrangements.",
    icon: ListMusicIcon,
  },
];

const InactiveDemoCard = () => (
  <Card className="w-full">
    <CardContent>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5 text-center">
          <h1 className="font-heading text-xl font-semibold tracking-tight">
            This demo link isn’t active
          </h1>
          <p className="text-muted-foreground text-pretty">
            Ask whoever shared it for a new link, or sign in with your own
            Planning Center account.
          </p>
        </div>
        <Link
          to="/auth"
          className={buttonVariants({ size: "lg", className: "w-full" })}
        >
          Sign in
        </Link>
      </div>
    </CardContent>
  </Card>
);

const WelcomeCard = ({
  state,
  onEnter,
}: {
  state: "starting" | "ready" | "launching";
  onEnter: () => void;
}) => (
  <Card className="w-full">
    <CardContent>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5 text-center">
          <h1 className="font-heading text-xl font-semibold tracking-tight">
            Welcome to the demo
          </h1>
          <p className="text-muted-foreground text-pretty">
            This is the real app, running on a real church’s Planning Center.
            People’s names and photos are swapped for fictional ones, and
            nothing you change is saved.
          </p>
        </div>

        <ItemGroup>
          {highlights.map((highlight) => (
            <Item key={highlight.title} render={<li />} size="sm">
              <ItemMedia variant="icon">
                <SidebarNavIcon
                  icon={highlight.icon}
                  className="text-muted-foreground"
                />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{highlight.title}</ItemTitle>
                <ItemDescription>{highlight.description}</ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>

        <Button
          type="button"
          size="lg"
          className="w-full"
          aria-busy={state !== "ready"}
          disabled={state !== "ready"}
          onClick={onEnter}
        >
          {state === "ready" ? "Explore the demo" : "Opening the demo…"}
          {state === "ready" ? (
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              strokeWidth={2}
              data-icon="inline-end"
              aria-hidden
            />
          ) : (
            <Spinner data-icon="inline-end" />
          )}
        </Button>
      </div>
    </CardContent>
  </Card>
);

/**
 * Starts the demo session while the visitor reads what they're about to see,
 * so entering is instant.
 */
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
      if (active) {
        setState("ready");
      }
    };
    void start();
    return () => {
      active = false;
    };
  }, [demoKey]);

  const enter = () => {
    // Anything cached from a signed-in organization must not leak into the
    // demo, so forget it and boot the app fresh; replacing also drops the key
    // from history.
    clearAccountScopedCaches();
    setState("launching");
    window.location.replace(DEFAULT_SIGN_IN_RETURN_PATH);
  };

  return (
    <main className="auth-backdrop flex min-h-svh items-center justify-center px-4 py-12">
      <div className="auth-stagger flex w-full max-w-md flex-col items-center gap-6">
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
          <InactiveDemoCard />
        ) : (
          <WelcomeCard state={state} onEnter={enter} />
        )}
      </div>
    </main>
  );
};
