import type { WebpackOverrideFn } from "@remotion/bundler";

/** The one loader option this override changes. */
interface CssLoaderOptions {
  modules?: { exportLocalsConvention?: string; namedExport?: boolean };
}

const CSS_LOADER = "css-loader";

/**
 * The marketing replica's CSS modules use dashed class names (`styles["chart-page"]`), as
 * Vite exports them. Remotion's css-loader defaults to camel-case-only, so keep names as-is.
 * Shared by the Studio/CLI config and the render scripts, which bundle on their own.
 */
export const webpackOverride: WebpackOverrideFn = (config) => {
  for (const rule of config.module?.rules ?? []) {
    const uses =
      rule instanceof Object && Array.isArray(rule.use) ? rule.use : [];
    for (const use of uses) {
      if (
        use instanceof Object &&
        "loader" in use &&
        use.loader?.includes(CSS_LOADER) === true &&
        use.options instanceof Object
      ) {
        const options: CssLoaderOptions = use.options;
        options.modules = {
          ...options.modules,
          exportLocalsConvention: "as-is",
        };
      }
    }
  }
  return config;
};
