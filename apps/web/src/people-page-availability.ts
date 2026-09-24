/**
 * Resolves `PEOPLE_PAGE_ENABLED`. `vite.config.ts` inlines the result at build time; the
 * development server falls back to enabled and builds to disabled.
 */
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
