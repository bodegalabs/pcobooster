import { redirect } from "next/navigation";

interface ServicesPlanIndexPageProps {
  params: Promise<{
    serviceTypeId: string;
    planId: string;
  }>;
}

const ServicesPlanIndexPage = async ({
  params,
}: ServicesPlanIndexPageProps) => {
  const { serviceTypeId, planId } = await params;

  redirect(
    `/services/${encodeURIComponent(serviceTypeId)}/plans/${encodeURIComponent(planId)}/assign`
  );
};

export default ServicesPlanIndexPage;
