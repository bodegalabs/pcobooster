import { z } from "zod";

export const PEOPLE_PAGE_NAV_CACHE_KEY = "worshipadmin:people-page-nav";

export interface PeoplePageNavState {
  enabled: boolean;
}

const peoplePageNavStateSchema = z.object({ enabled: z.boolean() });

export const parsePeoplePageNavState = (
  raw: string | null
): PeoplePageNavState | null => {
  if (raw === null) {
    return null;
  }

  try {
    const parsed = peoplePageNavStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
};

export const serializePeoplePageNavState = (
  state: PeoplePageNavState
): string => JSON.stringify(state);
