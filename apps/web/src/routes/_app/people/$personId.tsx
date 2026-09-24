import { createFileRoute } from "@tanstack/react-router";

import {
  PersonDetailPage,
  PersonDetailPageSkeleton,
} from "@/components/people/person-detail-page";
import { assertPeoplePageEnabled } from "@/lib/people-route";
import { personSearchSchema } from "@/lib/route-search";

const PersonRoute = () => {
  const { personId } = Route.useParams();
  const { month } = Route.useSearch();
  return <PersonDetailPage personId={personId} month={month ?? null} />;
};

export const Route = createFileRoute("/_app/people/$personId")({
  validateSearch: personSearchSchema,
  ssr: "data-only",
  beforeLoad: assertPeoplePageEnabled,
  pendingComponent: PersonDetailPageSkeleton,
  component: PersonRoute,
});
