import { redirect } from "next/navigation";

type ServicesPlanIndexPageProps = {
  params: Promise<{
    serviceTypeId: string;
    planId: string;
  }>;
};

export default async function ServicesPlanIndexPage({
  params,
}: ServicesPlanIndexPageProps) {
  const { serviceTypeId, planId } = await params;

  redirect(
    `/services/${encodeURIComponent(serviceTypeId)}/plans/${encodeURIComponent(planId)}/assign`
  );
}
