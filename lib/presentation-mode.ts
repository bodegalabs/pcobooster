import "server-only";
import { createHash } from "node:crypto";

export function isPresentationMode(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    !process.env.VERCEL &&
    process.env.PRESENTATION_MODE === "1"
  );
}

export function getPresentationSeed(): string {
  return process.env.PRESENTATION_SEED || "worshipadmin-presentation-v1";
}

export function getPresentationCacheScope(): string {
  if (!isPresentationMode()) return "live";
  const seedVersion = createHash("sha256")
    .update(getPresentationSeed())
    .digest("hex")
    .slice(0, 12);
  return `present-v1-${seedVersion}`;
}
