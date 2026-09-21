import { notFound } from "next/navigation";

import { PeoplePage } from "@/components/people/people-page";
import { isPeoplePageEnabled } from "@/people-page-availability";

const PeopleRoute = () => {
  if (!isPeoplePageEnabled()) {
    notFound();
  }

  return <PeoplePage />;
};

export default PeopleRoute;
