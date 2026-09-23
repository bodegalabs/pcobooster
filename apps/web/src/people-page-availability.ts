const localDevelopmentDefault = process.env.NODE_ENV !== "production";

export const resolvePeoplePageAvailability = (
  configuredValue: string | undefined,
  fallback = localDevelopmentDefault
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

export const isPeoplePageEnabled = (): boolean =>
  resolvePeoplePageAvailability(process.env.PEOPLE_PAGE_ENABLED);
