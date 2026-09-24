/** Settings `vite.config.ts` fixes when the app is built. */

/** `bun run dev:present` renders fictional data under a separate cache namespace. */
export const presentationMode: boolean =
  import.meta.env.VITE_PRESENTATION_SCOPE !== "live";
