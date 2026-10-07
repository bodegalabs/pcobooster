/**
 * Which drawing of a saved preview is on screen, and whether it failed. A failure belongs to
 * one drawing (the file's URI, the read's version, and the retry count), never to a URI: the
 * next file written to the same path, or a retry, draws afresh.
 */
export interface PreviewRenderState {
  readonly attempt: number;
  readonly failedKey: string | null;
  readonly retrying: boolean;
}

export type PreviewRenderAction =
  /** The drawing `key` failed; a late failure from an older drawing changes nothing. */
  | { readonly type: "failed"; readonly key: string }
  /** Try again pressed: the file is being read again. */
  | { readonly type: "retry" }
  /** The read again settled, saved or not: draw anew. */
  | { readonly type: "retried" };

export const initialPreviewRender: PreviewRenderState = {
  attempt: 0,
  failedKey: null,
  retrying: false,
};

export const previewRenderReducer = (
  state: PreviewRenderState,
  action: PreviewRenderAction
): PreviewRenderState => {
  switch (action.type) {
    case "failed": {
      return { ...state, failedKey: action.key };
    }
    case "retry": {
      return { ...state, retrying: true };
    }
    case "retried": {
      return { attempt: state.attempt + 1, failedKey: null, retrying: false };
    }
    default: {
      return state;
    }
  }
};

export interface PreviewRenderStatus {
  /** Remounts the renderer whenever it changes. */
  readonly key: string;
  readonly failed: boolean;
  readonly retrying: boolean;
}

export const previewRenderStatus = (
  state: PreviewRenderState,
  uri: string,
  version: number
): PreviewRenderStatus => {
  const key = `${state.attempt}:${version}:${uri}`;
  return {
    key,
    failed: !state.retrying && state.failedKey === key,
    retrying: state.retrying,
  };
};
