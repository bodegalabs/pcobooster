import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import { jsPluginSettings, selectJsPlugins } from "ultracite/oxlint/js-plugins";
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
    vitest,
    tanstackJsPlugins,
    shadcn,
    antiSlop,
    jsPlugins,
  ],
  ignorePatterns: [...(core.ignorePatterns ?? []), ".artifacts/**", "lint/**"],
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
    // Popover shells stay flush; inner sections own spacing.
    "local/no-popover-content-padding": "error",
    // Section dividers use Separator primitives, not border-b headers.
    "local/no-overlay-section-border-b": "error",
    // Hover and selection colors snap instantly; no color fade utilities.
    "local/no-transition-colors": "error",
    // Controls get their look from components/ui primitives, not call sites.
    "local/prefer-shared-controls": "error",
  },
  settings: jsPluginSettings,
});
