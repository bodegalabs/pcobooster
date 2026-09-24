import { notFound } from "@tanstack/react-router";

import { peoplePageEnabled } from "@/lib/build-settings";

/** People pages 404 unless `PEOPLE_PAGE_ENABLED` was on for this build. */
export const assertPeoplePageEnabled = (): void => {
  if (!peoplePageEnabled) {
    notFound({ throw: true });
  }
};
