import { mkdir } from "node:fs/promises";
import path from "node:path";

import { renderStill, selectComposition } from "@remotion/renderer";

import { appRoot, bundleVideo } from "./bundle";

/**
 * Renders review stills: `bun run stills <composition> <frame> [frame...]`, into
 * out/stills/<composition>/<frame>.png.
 */
const [compositionId, ...frames] = process.argv.slice(2);
if (compositionId === undefined || frames.length === 0) {
  throw new Error("Usage: bun run stills <composition> <frame> [frame...]");
}

const serveUrl = await bundleVideo();
const composition = await selectComposition({ serveUrl, id: compositionId });
const directory = path.join(appRoot, "out/stills", compositionId);
await mkdir(directory, { recursive: true });

for (const frame of frames.map(Number)) {
  const output = path.join(directory, `${String(frame).padStart(4, "0")}.png`);
  // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- each still mounts the replica fresh, as a render tab does
  await renderStill({ serveUrl, composition, frame, output });
  console.log(output);
}
