export const PEOPLE_PAGE_NAV_CACHE_KEY = "worshipadmin:people-page-nav";

export interface PeoplePageNavState {
  enabled: boolean;
}

export function parsePeoplePageNavState(
  raw: string | null
): PeoplePageNavState | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    if (typeof parsed.enabled !== "boolean") return null;
    return { enabled: parsed.enabled };
  } catch {
    return null;
  }
}

export function serializePeoplePageNavState(state: PeoplePageNavState): string {
  return JSON.stringify(state);
}
