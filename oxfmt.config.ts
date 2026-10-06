import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    ".artifacts/**",
    "docs/planning-center-api/**",
    "packages/api/migrations/**",
  ],
});
