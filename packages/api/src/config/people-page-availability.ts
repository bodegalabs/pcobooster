/** Unset means on for local development and off once deployed (`fallback`). */
export const resolvePeoplePageAvailability = (
  configuredValue: string | undefined,
  fallback: boolean
): boolean => {
  if (configuredValue === undefined || configuredValue === "") {
    return fallback;
  }
  if (configuredValue === "true") {
    return true;
  }
  if (configuredValue === "false") {
    return false;
  }
  throw new Error('PEOPLE_PAGE_ENABLED must be either "true" or "false"');
};
