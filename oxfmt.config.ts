import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    ".artifacts/**",
    "docs/planning-center-api/**",
    "packages/api/migrations/**",
    // Retained behavior fixtures are byte-exact snapshots.
    "apps/mobile/src/fixtures/**",
    "packages/client/src/fixtures/**",
    "apps/mobile/ios/**",
    "apps/mobile/android/**",
    "apps/mobile/build/**",
  ],
});
