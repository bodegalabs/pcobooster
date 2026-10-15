import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { getCompositions, renderMedia } from "@remotion/renderer";

import { appRoot, bundleVideo } from "./bundle";

/**
 * Renders every cut in both formats to out/<composition>.mp4, or only the compositions
 * named: `bun run render Launch30-9x16 Teaser15-16x9`.
 */
const requested = new Set(process.argv.slice(2));
const serveUrl = await bundleVideo();
const compositions = await getCompositions(serveUrl);
const [single] = requested;

if (requested.size === 1 && single !== undefined) {
  const composition = compositions.find(({ id }) => id === single);
  if (composition === undefined) {
    throw new Error(`No composition named ${single}`);
  }
  const outputLocation = path.join(appRoot, "out", `${composition.id}.mp4`);
  await mkdir(path.dirname(outputLocation), { recursive: true });
  let reported = -1;
  await renderMedia({
    serveUrl,
    composition,
    codec: "h264",
    crf: 16,
    pixelFormat: "yuv420p",
    outputLocation,
    onProgress: ({ progress }) => {
      const percent = Math.round(progress * 100);
      if (percent % 25 === 0 && percent !== reported) {
        reported = percent;
        console.log(`${composition.id} ${percent}%`);
      }
    },
  });
  console.log(outputLocation);
} else {
  // Back-to-back renders in one process can stall the second one, so each composition
  // gets a process of its own.
  for (const { id } of compositions) {
    if (requested.size === 0 || requested.has(id)) {
      const result = spawnSync("bun", ["run", import.meta.filename, id], {
        stdio: "inherit",
      });
      if (result.status !== 0) {
        throw new Error(`Rendering ${id} failed`);
      }
    }
  }
}
