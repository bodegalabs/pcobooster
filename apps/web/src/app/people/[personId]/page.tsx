import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  PersonDetailPage,
  PersonDetailPageSkeleton,
} from "@/components/people/person-detail-page";
import { isPeoplePageEnabled } from "@/people-page-availability";

const PersonRoute = async ({
  params,
}: {
  params: Promise<{ personId: string }>;
}) => {
  if (!isPeoplePageEnabled()) {
    notFound();
  }

  const { personId } = await params;
  return (
    <Suspense fallback={<PersonDetailPageSkeleton />}>
      <PersonDetailPage personId={personId} />
    </Suspense>
  );
};

export default PersonRoute;
