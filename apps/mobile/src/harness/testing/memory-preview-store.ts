import type { PreviewStore } from "../../features/songs/preview-store";

export interface MemoryWrite {
  readonly scope: string;
  readonly folder: string;
  readonly name: string;
}

export interface MemoryDownload {
  readonly scope: string;
  readonly url: string;
  readonly signal: AbortSignal;
}

const uriOf = (scope: string, folder: string, name: string) =>
  `file:///cache/song-previews/${scope}/${folder}/${name}`;

/**
 * Previews in memory, as `preview-files.ts` keeps them on a device: what is saved, what was
 * written and downloaded, and `evict` for the system purging the cache. `beforeSave` holds a
 * download until the test lets it land.
 */
export const makeMemoryPreviewStore = (
  options: { readonly beforeSave?: () => Promise<void> } = {}
) => {
  const saved = new Map<string, string>();
  const writes: MemoryWrite[] = [];
  const downloads: MemoryDownload[] = [];
  const store: PreviewStore = {
    writeBase64: (scope, folder, name, base64) => {
      writes.push({ scope, folder, name });
      const uri = uriOf(scope, folder, name);
      saved.set(uri, base64);
      return uri;
    },
    download: async (scope, folder, name, url, signal) => {
      downloads.push({ scope, url: url.href, signal });
      await options.beforeSave?.();
      const uri = uriOf(scope, folder, name);
      saved.set(uri, `downloaded:${url.href}`);
      return uri;
    },
    playable: async (_scope, _folder, _name, url) =>
      await Promise.resolve(url.href),
    exists: (uri) => saved.has(uri),
    discard: (uri) => {
      saved.delete(uri);
    },
    clear: () => {
      saved.clear();
    },
  };
  return {
    store,
    saved,
    writes,
    downloads,
    evict: (uri: string) => {
      saved.delete(uri);
    },
  };
};
