import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    ".artifacts/**",
    "docs/planning-center-api/**",
    "packages/api/migrations/**",
    // Xcode and Icon Composer write these; parity fixtures are byte-exact snapshots.
    "apps/ios/**/*.xcassets/**",
    "apps/ios/**/*.icon/**",
    "apps/ios/**/Fixtures/**",
    "apps/ios/build/**",
  ],
});
