import { notFound } from "next/navigation";

import { PeoplePage } from "@/components/people/people-page";
import { peoplePageFlag } from "@/flags";

const PeopleRoute = async () => {
  if (!(await peoplePageFlag())) {
    notFound();
  }

  return <PeoplePage />;
};

export default PeopleRoute;
