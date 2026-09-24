/** Settings `vite.config.ts` fixes when the app is built. */

/** `PEOPLE_PAGE_ENABLED`; the API's `features.people` answer overrides it for navigation. */
export const peoplePageEnabled: boolean = import.meta.env
  .VITE_PEOPLE_PAGE_ENABLED;

/** `bun run dev:present` renders fictional data under a separate cache namespace. */
export const presentationMode: boolean =
  import.meta.env.VITE_PRESENTATION_SCOPE !== "live";
