import {
  ArrowRight01Icon,
  Calendar04Icon,
  MusicNote03Icon,
  UsersIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import type { PlanView } from "@pcobooster/planning-center-models/plan-overview";
import { useEffect, useId, useRef, useState } from "react";

import { BrandRocketLogo } from "@/components/brand-rocket-logo";
import { HotkeyChord } from "@/components/hotkey-chord";
import { planViewIcons } from "@/components/plan-view-icons";
import { SidebarNavIcon } from "@/components/sidebar-nav-icon";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFeatureEnabled } from "@/hooks/use-feature-enabled";
import { SHORTCUTS_PALETTE_HOTKEY } from "@/lib/app-hotkeys";
import { getPlanViewLabel } from "@/lib/app-routes";
import { ROCKET_ANIMATION } from "@/lib/brand-rocket-animation";
import { cn } from "@/lib/utils";

interface Area {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly icon: IconSvgElement;
}

/** In the order people reach for them, not the tab order. */
const planViewGuide: readonly {
  view: PlanView;
  description: string;
}[] = [
  {
    view: "plan",
    description: "The run sheet. Songs, keys, and items, edited in place.",
  },
  {
    view: "assign",
    description: "Fill an open position with who’s available and rested.",
  },
  {
    view: "lineup",
    description: "Every team’s filled and open roles, with responses.",
  },
  {
    view: "times",
    description: "Service and rehearsal times, and who’s in each.",
  },
  {
    view: "overview",
    description: "What’s still missing before the service.",
  },
];

/** How long each plan view stays highlighted before the preview moves on. */
const SHOWCASE_STEP_MS = 2600;

const servicesArea: Area = {
  key: "services",
  title: "Services",
  description: "Every upcoming plan, with yours pinned at the top.",
  icon: Calendar04Icon,
};

const peopleArea: Area = {
  key: "people",
  title: "People",
  description: "Team health and who’s due to serve.",
  icon: UsersIcon,
};

const songsArea: Area = {
  key: "songs",
  title: "Songs",
  description: "Your library, with a chord chart for each song.",
  icon: MusicNote03Icon,
};

const nextPlanView = (current: PlanView): PlanView => {
  const next =
    (planViewGuide.findIndex((entry) => entry.view === current) + 1) %
    planViewGuide.length;
  return planViewGuide[next]?.view ?? current;
};

const prefersReducedMotion = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The brand mark, launching as the guide opens. */
const WelcomeHero = ({ demo }: { demo: boolean }) => {
  const maskId = useId().replaceAll(":", "");
  return (
    <div className="welcome-hero flex flex-col items-center gap-4 px-6 pt-10 pb-7 text-center">
      <div className="flex items-center gap-2.5">
        <span className="text-xl tracking-tight">
          <strong className="font-bold">PCO</strong>Booster
        </span>
        <div
          aria-hidden
          className={cn("size-10", ROCKET_ANIMATION.takeoff.className)}
        >
          <BrandRocketLogo maskId={maskId} />
        </div>
      </div>
      <div className="flex max-w-md flex-col gap-2">
        <ResponsiveDialogTitle variant="hero">
          {demo ? "Welcome to the demo" : "Welcome aboard"}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          {demo
            ? "A real church’s Planning Center, with fictional names. Look around freely; nothing you change is saved."
            : "Your services, teams, people, and songs from Planning Center, in one fast view. Every change saves straight back."}
        </ResponsiveDialogDescription>
      </div>
    </div>
  );
};

const AreaTile = ({ area }: { area: Area }) => (
  <li className="bg-card/70 border-border/60 flex items-center gap-3 rounded-2xl border p-3 sm:flex-col sm:items-start sm:gap-2 sm:p-3.5">
    <span className="bg-muted text-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
      <SidebarNavIcon icon={area.icon} className="size-4" />
    </span>
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="text-sm font-medium">{area.title}</p>
      <p className="text-muted-foreground text-xs text-pretty">
        {area.description}
      </p>
    </div>
  </li>
);

/**
 * A miniature of the plan's view tabs that steps through each one, so people see the
 * workspace before they open it. Hovering or focusing it holds the current view; with
 * reduced motion it waits for a click.
 */
const PlanViewShowcase = () => {
  const [view, setView] = useState<PlanView>("plan");
  const [held, setHeld] = useState(false);

  useEffect(() => {
    // Held, or reduced motion: the person steps through the views themselves.
    const autoplay = !held && !prefersReducedMotion();
    const timer = autoplay
      ? window.setInterval(() => {
          setView(nextPlanView);
        }, SHOWCASE_STEP_MS)
      : undefined;
    return () => {
      window.clearInterval(timer);
    };
  }, [held]);

  return (
    <div className="bg-muted/50 border-border/60 flex flex-col gap-2 rounded-2xl border p-3">
      <p className="text-muted-foreground px-1 text-xs font-medium">
        Inside every plan
      </p>
      <Tabs
        value={view}
        onValueChange={(next: PlanView) => {
          setView(next);
        }}
        onPointerEnter={() => {
          setHeld(true);
        }}
        onPointerLeave={() => {
          setHeld(false);
        }}
        onFocus={() => {
          setHeld(true);
        }}
        onBlur={() => {
          setHeld(false);
        }}
      >
        <TabsList className="w-full overflow-x-auto">
          {planViewGuide.map((entry) => (
            <TabsTrigger key={entry.view} value={entry.view}>
              <SidebarNavIcon icon={planViewIcons[entry.view]} />
              {/* Phones show icons only; the line below names the view. */}
              <span className="max-sm:sr-only">
                {getPlanViewLabel(entry.view)}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {planViewGuide.map((entry) => (
          <TabsContent key={entry.view} value={entry.view}>
            <p className="animate-in fade-in-0 slide-in-from-bottom-1 min-h-10 px-1 duration-300 motion-reduce:animate-none">
              <span className="font-medium">
                {getPlanViewLabel(entry.view)}.
              </span>{" "}
              <span className="text-muted-foreground">{entry.description}</span>
            </p>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

/**
 * The first thing a new account sees: what pcobooster.com is for and where each
 * part of it lives. It opens once per account and again from the account menu.
 */
export const WelcomeDialog = ({
  open,
  onOpenChange,
  onStartTour,
  demo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartTour: () => void;
  demo: boolean;
}) => {
  const peopleEnabled = useFeatureEnabled("people");
  const songsEnabled = useFeatureEnabled("chordCharts");
  const tourButtonRef = useRef<HTMLButtonElement>(null);
  const areas: Area[] = [servicesArea];
  if (peopleEnabled) {
    areas.push(peopleArea);
  }
  if (songsEnabled) {
    areas.push(songsArea);
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        layout="flush"
        initialFocus={tourButtonRef}
        desktopClassName="sm:max-w-xl"
      >
        <div className="welcome-stagger flex min-h-0 flex-col overflow-y-auto">
          <WelcomeHero demo={demo} />
          <ul
            className={cn(
              "grid gap-2 px-4 md:px-6",
              areas.length === 3 && "sm:grid-cols-3",
              areas.length === 2 && "sm:grid-cols-2"
            )}
          >
            {areas.map((area) => (
              <AreaTile key={area.key} area={area} />
            ))}
          </ul>
          <div className="px-4 pt-3 md:px-6">
            <PlanViewShowcase />
          </div>
          <div className="flex flex-col gap-4 pt-5 md:px-6 md:pb-6">
            <ResponsiveDialogFooter>
              <ResponsiveDialogClose render={<Button variant="ghost" />}>
                Explore on my own
              </ResponsiveDialogClose>
              <Button ref={tourButtonRef} onClick={onStartTour}>
                Show me around
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                  data-icon="inline-end"
                  aria-hidden
                />
              </Button>
            </ResponsiveDialogFooter>
            <p
              className={cn(
                "text-muted-foreground text-center text-xs max-md:px-4",
                demo && "max-md:hidden"
              )}
            >
              <span className="max-md:hidden">
                <HotkeyChord
                  id="welcome-shortcuts"
                  binding={SHORTCUTS_PALETTE_HOTKEY}
                  className="inline-flex align-middle"
                />{" "}
                for shortcuts
                {demo ? null : " · "}
              </span>
              {demo ? null : "Questions or ideas? Send us Feedback anytime."}
            </p>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
};
