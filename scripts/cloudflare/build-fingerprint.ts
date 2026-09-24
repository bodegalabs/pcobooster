/**
 * Fingerprint the environment that `next build` inlines or reads while building the web app.
 * `cloudflare-build` stores it with the `.next` outputs it uploads; the preview job reuses
 * those outputs only when its own fingerprint matches, and otherwise builds from scratch.
 * Values are hashed, never printed.
 *
 *   bun scripts/cloudflare/build-fingerprint.ts
 */
import { createHash } from "node:crypto";

/** Server-side variables the web app reads at build time, in addition to every `NEXT_PUBLIC_*`. */
const buildVariables = [
  "DEV_AUTH_BYPASS",
  "NODE_ENV",
  "PEOPLE_PAGE_ENABLED",
  "PRESENTATION_MODE",
  "PRESENTATION_SEED",
] as const;

export const buildFingerprint = (
  environment: Readonly<Record<string, string | undefined>>
): string => {
  const names = new Set<string>([
    ...buildVariables,
    ...Object.keys(environment).filter((name) =>
      name.startsWith("NEXT_PUBLIC_")
    ),
  ]);
  // Unset and empty are equivalent to every reader in the apps.
  const entries = [...names]
    .toSorted()
    .map((name) => [name, environment[name] ?? ""] as const)
    .filter(([, value]) => value !== "");
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
};

if (import.meta.main) {
  process.stdout.write(`${buildFingerprint(process.env)}\n`);
}
