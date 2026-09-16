import { notFound } from "next/navigation";

import { PersonDetailPage } from "@/components/people/person-detail-page";
import { peoplePageFlag } from "@/flags";

export default async function PersonRoute({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  if (!(await peoplePageFlag())) notFound();

  const { personId } = await params;
  return <PersonDetailPage personId={personId} />;
}
