import { Directory, File, Paths } from "expo-file-system";

import { PreviewError, previewScopeFolder, secureUrl } from "./previews";
import type { PreviewFiles } from "./previews";

/**
 * Previews on the device: `Caches/song-previews/<scope>/<folder>/<name>`. The system may purge
 * the cache at any time; a preview is written again when its screen opens. Only the account
 * context on screen keeps a folder: writing for one scope removes every other scope's, and
 * forgetting an account removes them all.
 */
const ROOT_FOLDER = "song-previews";

const root = () => new Directory(Paths.cache, ROOT_FOLDER);

const removeOtherScopes = (keep: string) => {
  const folder = root();
  if (!folder.exists) {
    return;
  }
  for (const entry of folder.list()) {
    if (entry.name !== keep) {
      entry.delete();
    }
  }
};

/** An empty folder for one preview, so a new version never mixes with the last. */
const freshFolder = (scope: string, folder: string): Directory => {
  const scopeFolder = previewScopeFolder(scope);
  removeOtherScopes(scopeFolder);
  const directory = new Directory(root(), scopeFolder, folder);
  if (directory.exists) {
    directory.delete();
  }
  directory.create({ intermediates: true });
  return directory;
};

export const devicePreviewFiles: PreviewFiles = {
  writeBase64: (scope, folder, name, base64) => {
    const file = new File(freshFolder(scope, folder), name);
    file.create();
    file.write(base64, { encoding: "base64" });
    return file.uri;
  },
  download: async (scope, folder, name, url, signal) => {
    // The link is Planning Center's signed one; it never carries this app's credentials.
    if (secureUrl(url) === null) {
      throw new PreviewError("insecure-link");
    }
    signal.throwIfAborted();
    const file = new File(freshFolder(scope, folder), name);
    const saved = await File.downloadFileAsync(url, file, {
      idempotent: true,
      signal,
    });
    return saved.uri;
  },
};

/** Removes every saved preview, for every account (signing out or forgetting one). */
export const clearSongPreviews = (): void => {
  try {
    const folder = root();
    if (folder.exists) {
      folder.delete();
    }
  } catch {
    // Each account context reads only its own scope's folder, and the system purges caches.
  }
};
