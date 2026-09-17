import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import { jsPluginSettings, selectJsPlugins } from "ultracite/oxlint/js-plugins";
import next from "ultracite/oxlint/next";
import nextJsPlugins from "ultracite/oxlint/next/js-plugins";
import react from "ultracite/oxlint/react";
import shadcn from "ultracite/oxlint/shadcn";
import tanstack from "ultracite/oxlint/tanstack";
import tanstackJsPlugins from "ultracite/oxlint/tanstack/js-plugins";
import vitest from "ultracite/oxlint/vitest";

const jsPlugins = selectJsPlugins(["react-doctor"]);

export default defineConfig({
  extends: [
    core,
    react,
    tanstack,
    next,
    vitest,
    nextJsPlugins,
    tanstackJsPlugins,
    shadcn,
    antiSlop,
    jsPlugins,
  ],
  ignorePatterns: [...core.ignorePatterns, "lint/**"],
  options: { typeAware: true },
  jsPlugins: [
    ...(jsPlugins.jsPlugins ?? []),
    ...(shadcn.jsPlugins ?? []),
    {
      name: "local",
      specifier: "./lint/oxlint-plugin-local.mjs",
    },
  ],
  rules: {
    // Keep icons/buttons from overlapping Input/Textarea text; use InputGroup.
    "local/no-absolute-input-overlay": "error",
  },
  settings: jsPluginSettings,
});
