import type { SessionRecordingOptions } from "posthog-js";

import { analyticsUrl } from "./privacy";

export const replayOptions: SessionRecordingOptions = {
  maskAllInputs: true,
  maskTextSelector: "*",
  slimDOMOptions: "all",
  blockSelector: "img, svg, canvas, video, audio, iframe, object, embed",
  // Keep only static rendering/semantic attributes; discard IDs, URLs and labels.
  maskAttributeFn: (name, value) =>
    name === "class" || name === "type" || name === "role" ? value : "",
  maskCapturedNetworkRequestFn: (request) => ({
    ...request,
    name: analyticsUrl(request.name),
  }),
  recordHeaders: false,
  recordBody: false,
  captureCanvas: { recordCanvas: false },
  recordCrossOriginIframes: false,
  captureJsonLd: false,
};
