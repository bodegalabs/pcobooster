import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PersonDetailPage } from "@/components/people/person-detail-page";
import { Skeleton } from "@/components/ui/skeleton";
import { peoplePageFlag } from "@/flags";

const PersonRoute = async ({
  params,
}: {
  params: Promise<{ personId: string }>;
}) => {
  if (!(await peoplePageFlag())) {
    notFound();
  }

  const { personId } = await params;
  return (
    <Suspense
      fallback={
        <output className="flex flex-col gap-4 p-6" aria-label="Loading person">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </output>
      }
    >
      <PersonDetailPage personId={personId} />
    </Suspense>
  );
};

export default PersonRoute;
