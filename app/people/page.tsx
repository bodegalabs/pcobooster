import { notFound } from "next/navigation";

import { PeoplePage } from "@/components/people/people-page";
import { peoplePageFlag } from "@/flags";

export default async function PeopleRoute() {
  if (!(await peoplePageFlag())) notFound();

  return <PeoplePage />;
}
