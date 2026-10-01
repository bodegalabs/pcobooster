import { createFileRoute } from "@tanstack/react-router";

import { PeoplePage } from "@/components/people/people-page";
import { PeoplePageSkeleton } from "@/components/people/people-skeletons";
import {
  parsePeopleDashboardScope,
  parsePeopleDashboardView,
} from "@/lib/people-dashboard";
import { assertPeoplePageEnabled } from "@/lib/people-route";
import { peopleSearchSchema } from "@/lib/route-search";

const PeopleRoute = () => {
  const { view, scope } = Route.useSearch();
  return (
    <PeoplePage
      view={parsePeopleDashboardView(view)}
      scopeChoice={parsePeopleDashboardScope(scope)}
    />
  );
};

export const Route = createFileRoute("/_app/people/")({
  validateSearch: peopleSearchSchema,
  // Route checks run on the server; the page renders from browser caches.
  ssr: "data-only",
  beforeLoad: assertPeoplePageEnabled,
  pendingComponent: PeoplePageSkeleton,
  component: PeopleRoute,
});
