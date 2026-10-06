import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    ".artifacts/**",
    "docs/planning-center-api/**",
    "packages/api/migrations/**",
    // Asset catalog JSON, copied fixtures, and generated tokens are written by tools.
    "apps/mobile/assets/**",
    "apps/mobile/src/harness/fixtures/**",
    "apps/mobile/src/design/colors.generated.ts",
    "apps/mobile/ios/**",
    "apps/mobile/.expo/**",
  ],
});
