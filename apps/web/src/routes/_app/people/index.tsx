import { createFileRoute } from "@tanstack/react-router";

import { PeoplePage } from "@/components/people/people-page";
import { PeoplePageSkeleton } from "@/components/people/people-skeletons";
import { assertPeoplePageEnabled } from "@/lib/people-route";

export const Route = createFileRoute("/_app/people/")({
  // Route checks run on the server; the page renders from browser caches.
  ssr: "data-only",
  beforeLoad: assertPeoplePageEnabled,
  pendingComponent: PeoplePageSkeleton,
  component: PeoplePage,
});
