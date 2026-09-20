import "server-only";
import { createHash } from "node:crypto";

const isPresentationMode = (): boolean =>
  process.env.NODE_ENV === "development" &&
  !(process.env.VERCEL !== undefined && process.env.VERCEL !== "") &&
  process.env.PRESENTATION_MODE === "1";

export const getPresentationCacheScope = (): string => {
  if (!isPresentationMode()) {
    return "live";
  }

  const seed = process.env.PRESENTATION_SEED ?? "worshipadmin-presentation-v1";
  const seedVersion = createHash("sha256")
    .update(seed)
    .digest("hex")
    .slice(0, 12);
  return `present-v1-${seedVersion}`;
};
