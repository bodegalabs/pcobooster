import {
  Calendar04Icon,
  MusicNote03Icon,
  UsersIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { PlanView } from "@pcobooster/planning-center-models/plan-overview";

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
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { useFeatureEnabled } from "@/hooks/use-feature-enabled";
import { SHORTCUTS_PALETTE_HOTKEY } from "@/lib/app-hotkeys";
import { getPlanViewLabel } from "@/lib/app-routes";
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
  { view: "plan", description: "The run sheet: songs, keys, and items." },
  {
    view: "assign",
    description: "Fill an open position with who’s available and rested.",
  },
  { view: "lineup", description: "Every team’s filled and open roles." },
  { view: "times", description: "Service and rehearsal times." },
  {
    view: "overview",
    description: "What’s still missing before the service.",
  },
];

const servicesArea: Area = {
  key: "services",
  title: "Services",
  description:
    "Every upcoming plan, with the ones you’re on pinned at the top. Open a plan to work on it:",
  icon: Calendar04Icon,
};

const AreaRow = ({ area }: { area: Area }) => (
  <li className="flex gap-3">
    <span className="bg-muted text-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
      <SidebarNavIcon icon={area.icon} className="size-4" />
    </span>
    <div className="min-w-0">
      <p className="text-sm font-medium">{area.title}</p>
      <p className="text-muted-foreground text-sm">{area.description}</p>
    </div>
  </li>
);

const PlanViewList = () => (
  <ul className="border-border/60 ml-4 flex flex-col gap-1.5 border-l pl-7">
    {planViewGuide.map(({ view, description }) => (
      <li key={view} className="flex items-baseline gap-2 text-sm">
        <span className="flex h-lh shrink-0 items-center self-start">
          <SidebarNavIcon
            icon={planViewIcons[view]}
            className="text-muted-foreground size-3.5"
          />
        </span>
        <span className="font-medium">{getPlanViewLabel(view)}</span>
        <span className="text-muted-foreground min-w-0">{description}</span>
      </li>
    ))}
  </ul>
);

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
  const sections: Area[] = [];
  if (peopleEnabled) {
    sections.push({
      key: "people",
      title: "People",
      description:
        "Team health, who to check in with, and who is due to serve.",
      icon: UsersIcon,
    });
  }
  if (songsEnabled) {
    sections.push({
      key: "songs",
      title: "Songs",
      description: "Your song library, with a chord chart for each song.",
      icon: MusicNote03Icon,
    });
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent desktopClassName="sm:max-w-lg">
        <ResponsiveDialogHeader className="text-left">
          <ResponsiveDialogTitle>
            Welcome to pcobooster.com
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {demo
              ? "This demo uses a sample church. Look around freely; nothing you change is saved."
              : "Your services, teams, people, and songs from Planning Center, in one fast view. Changes you make here save straight to Planning Center."}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="flex flex-col gap-4 max-md:px-4">
          <ul className="flex flex-col gap-3">
            <AreaRow area={servicesArea} />
          </ul>
          <PlanViewList />
          {sections.length === 0 ? null : (
            <ul className="flex flex-col gap-3">
              {sections.map((area) => (
                <AreaRow key={area.key} area={area} />
              ))}
            </ul>
          )}
          <p
            className={cn(
              "text-muted-foreground border-border/60 border-t pt-4 text-xs",
              demo && "max-md:hidden"
            )}
          >
            <span className="max-md:hidden">
              Press{" "}
              <HotkeyChord
                id="welcome-shortcuts"
                binding={SHORTCUTS_PALETTE_HOTKEY}
                className="inline-flex align-middle"
              />{" "}
              for keyboard shortcuts.{" "}
            </span>
            {demo
              ? null
              : "Something missing or confusing? Send it through Feedback; we read every note."}
          </p>
        </div>
        <ResponsiveDialogFooter>
          <ResponsiveDialogClose render={<Button variant="outline" />}>
            Explore on my own
          </ResponsiveDialogClose>
          <Button onClick={onStartTour}>Show me around</Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
};
