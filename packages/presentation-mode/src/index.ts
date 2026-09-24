import { createHash } from "node:crypto";

/**
 * The settings that switch on presentation mode. The API Worker passes its bound values; the
 * product's Vite dev server passes `process.env` so both derive the same cache scope.
 */
export interface PresentationEnvironment {
  readonly NODE_ENV?: string;
  readonly PRESENTATION_MODE?: string;
  readonly PRESENTATION_SEED?: string;
}

export const isPresentationMode = (
  environment: PresentationEnvironment
): boolean =>
  environment.NODE_ENV !== "production" &&
  environment.PRESENTATION_MODE === "1";

export const getPresentationSeed = (
  environment: PresentationEnvironment
): string => environment.PRESENTATION_SEED ?? "pcobooster-presentation-v1";

export const getPresentationCacheScope = (
  environment: PresentationEnvironment
): string => {
  if (!isPresentationMode(environment)) {
    return "live";
  }
  const seedVersion = createHash("sha256")
    .update(getPresentationSeed(environment))
    .digest("hex")
    .slice(0, 12);
  return `present-v1-${seedVersion}`;
};
