import type { SessionRecordingOptions } from "posthog-js";

import { analyticsUrl } from "./privacy";
import { replayBlockSelector, replayMaskTextSelector } from "./replay-markers";

/**
 * Session replay records product UI text by default. The web app marks Planning Center
 * person-identifying text and avatars with {@link replayMaskTextSelector} and
 * {@link replayBlockSelector}; inputs stay fully masked.
 */
export const replayOptions: SessionRecordingOptions = {
  maskAllInputs: true,
  maskTextSelector: replayMaskTextSelector,
  slimDOMOptions: "all",
  blockSelector: replayBlockSelector,
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

/** Masking fields reconciled with PostHog project settings in `reports.ts`. */
export const replayMaskingConfig = () => ({
  maskTextSelector: replayOptions.maskTextSelector,
  blockSelector: replayOptions.blockSelector,
  maskAllInputs: replayOptions.maskAllInputs,
});
