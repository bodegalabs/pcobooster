import type { TourStep } from "@/components/onboarding/guided-tour";

/** The app tour, on Services: where each part of the product lives. */
export const appTourSteps: readonly TourStep[] = [
  {
    target: "nav-services",
    title: "Services",
    body: "Your home base. Every upcoming plan for the service types you can see in Planning Center.",
  },
  {
    target: "your-services",
    title: "Plans you’re on",
    body: "Services you’re scheduled for are pinned here. Open one to jump straight into its plan.",
    side: "bottom",
  },
  {
    target: "plan-search",
    title: "Find any plan",
    body: "Search by name, series, or date, and narrow by service type or date range. Open a plan to build its run sheet and schedule its teams.",
    side: "bottom",
  },
  {
    target: "nav-people",
    title: "People",
    body: "Team health: who to check in with, who’s serving too often, and who is due to serve.",
  },
  {
    target: "nav-songs",
    title: "Songs",
    body: "Your Planning Center song library. Open a song to write or import its chord chart.",
  },
  {
    target: "mobile-menu",
    title: "Menu",
    body: "Services, People, Songs, and your account all live behind this menu.",
    side: "bottom",
  },
  {
    target: "feedback",
    title: "Tell us what’s missing",
    body: "pcobooster.com is in beta. Feedback goes straight to the people building it, and we read every note.",
  },
  {
    target: "account-menu",
    title: "Your account",
    body: "Appearance, your Planning Center access, keyboard shortcuts, and this guide whenever you want it again.",
    side: "top",
  },
];
