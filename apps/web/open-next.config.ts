import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

export default {
  ...defineCloudflareConfig({ incrementalCache: staticAssetsIncrementalCache }),
  // CI restores `cloudflare-build`'s `.next` for previews when the build environment matches.
  buildCommand:
    process.env.PCOBOOSTER_PREBUILT_NEXT === "1"
      ? "true"
      : "bun run --cwd ../.. build:marketing && bun run build",
};
