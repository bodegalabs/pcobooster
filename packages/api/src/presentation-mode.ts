import { createHash } from "node:crypto";

export const isPresentationMode = (): boolean =>
  process.env.NODE_ENV === "development" &&
  !(process.env.VERCEL !== undefined && process.env.VERCEL !== "") &&
  process.env.PRESENTATION_MODE === "1";

export const getPresentationSeed = (): string =>
  process.env.PRESENTATION_SEED ?? "worshipadmin-presentation-v1";

export const getPresentationCacheScope = (): string => {
  if (!isPresentationMode()) {
    return "live";
  }
  const seedVersion = createHash("sha256")
    .update(getPresentationSeed())
    .digest("hex")
    .slice(0, 12);
  return `present-v1-${seedVersion}`;
};
