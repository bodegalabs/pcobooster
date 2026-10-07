import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useEffect, useId, useReducer } from "react";

import { holdKeepAwake } from "./preview-lifecycle";
import {
  initialPreviewRender,
  previewRenderReducer,
  previewRenderStatus,
} from "./preview-render";
import type { PreviewRenderStatus } from "./preview-render";

/** Keeps the screen awake while `active` (its screen visible, the feature on). */
export const useKeepAwakeWhile = (active: boolean): void => {
  // A tag per mount, so one screen leaving never releases another's hold.
  const id = useId();
  useEffect(() => {
    const release = active
      ? holdKeepAwake(
          `song-preview${id}`,
          activateKeepAwakeAsync,
          deactivateKeepAwake
        )
      : null;
    return () => {
      release?.();
    };
  }, [active, id]);
};

export interface PreviewRender extends PreviewRenderStatus {
  /** The drawing on screen failed. */
  readonly handleFailure: () => void;
  /** Reads the file again, then draws it anew. */
  readonly handleRetry: () => void;
}

/**
 * The drawing of the saved preview `uri`, at the read's `version` (its `dataUpdatedAt`): a new
 * version or a retry remounts the renderer, and a failure shows only for the drawing that failed.
 */
export const usePreviewRender = (
  uri: string,
  version: number,
  refresh: () => Promise<void>
): PreviewRender => {
  const [state, dispatch] = useReducer(
    previewRenderReducer,
    initialPreviewRender
  );
  const status = previewRenderStatus(state, uri, version);
  const { key } = status;
  return {
    ...status,
    handleFailure: () => {
      dispatch({ type: "failed", key });
    },
    handleRetry: () => {
      dispatch({ type: "retry" });
      void (async () => {
        try {
          await refresh();
        } catch {
          // A failed read shows through the read's own state; the drawing still starts over.
        }
        dispatch({ type: "retried" });
      })();
    },
  };
};
