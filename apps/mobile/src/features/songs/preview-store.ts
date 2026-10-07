import { throwIfAborted } from "@pcobooster/client/abort-signal";

import { PreviewError } from "./previews";
import type { PreviewFiles, PreviewWriter } from "./previews";

/**
 * The file operations behind the previews (`preview-files.ts` on a device, memory in tests),
 * without the rule that a cleared device never gets a preview back. `guardPreviewStore` adds it.
 */
export interface PreviewStore {
  readonly writeBase64: (
    scope: string,
    folder: string,
    name: string,
    base64: string
  ) => string;
  /** Saves a signed https link's file without credentials; stops when `signal` aborts. */
  readonly download: (
    scope: string,
    folder: string,
    name: string,
    url: URL,
    signal: AbortSignal
  ) => Promise<string>;
  /** What the system player opens for a signed media link (see `PreviewWriter.playable`). */
  readonly playable: (
    scope: string,
    folder: string,
    name: string,
    url: URL,
    signal: AbortSignal
  ) => Promise<string>;
  readonly exists: (uri: string) => boolean;
  /** Removes the saved preview at `uri` and its folder; anything else (a link) is left alone. */
  readonly discard: (uri: string) => void;
  /** Removes every saved preview for every account. */
  readonly clear: () => void;
}

export interface GuardedPreviews {
  readonly files: PreviewFiles;
  /** Removes every saved preview and refuses any still on its way. */
  readonly clear: () => void;
}

/**
 * Previews that a clear always wins against. Each read starts its work with `begin`; clearing
 * (forgetting an account, signing out) counts as a new generation, so work begun before it
 * refuses to write, and a download that lands after it is removed again and fails. The read's
 * abort signal (its screen left) does the same.
 */
export const guardPreviewStore = (store: PreviewStore): GuardedPreviews => {
  let generation = 0;
  const begin = (scope: string, signal: AbortSignal): PreviewWriter => {
    const started = generation;
    const check = () => {
      throwIfAborted(signal);
      if (generation !== started) {
        throw new PreviewError("forgotten");
      }
    };
    const settle = (uri: string): string => {
      try {
        check();
      } catch (error) {
        store.discard(uri);
        throw error;
      }
      return uri;
    };
    return {
      writeBase64: (folder, name, base64) => {
        check();
        return store.writeBase64(scope, folder, name, base64);
      },
      download: async (folder, name, url) => {
        check();
        return settle(await store.download(scope, folder, name, url, signal));
      },
      playable: async (folder, name, url) => {
        check();
        return settle(await store.playable(scope, folder, name, url, signal));
      },
    };
  };
  return {
    files: { begin, exists: store.exists },
    clear: () => {
      generation += 1;
      store.clear();
    },
  };
};
