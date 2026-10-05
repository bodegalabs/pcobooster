import {
  parsePeopleDashboardScope,
  parsePeopleDashboardView,
} from "@pcobooster/client/people-dashboard";
import { createFileRoute } from "@tanstack/react-router";

import { PeoplePage } from "@/components/people/people-page";
import { PeoplePageSkeleton } from "@/components/people/people-skeletons";
import { featureGuard } from "@/lib/features";
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
  beforeLoad: featureGuard("people"),
  pendingComponent: PeoplePageSkeleton,
  component: PeopleRoute,
});
