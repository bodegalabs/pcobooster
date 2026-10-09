import path from "node:path";

import { bundle } from "@remotion/bundler";

import { webpackOverride } from "../src/webpack-override";

export const appRoot = path.resolve(import.meta.dirname, "..");

/** Bundles the compositions once for a batch of renders. */
export const bundleVideo = async (): Promise<string> =>
  await bundle({
    entryPoint: path.join(appRoot, "src/index.ts"),
    webpackOverride,
  });
