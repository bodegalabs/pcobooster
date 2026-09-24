import { useCallback, useSyncExternalStore } from "react";

import {
  readBrowserStorage,
  subscribeBrowserStorage,
  writeBrowserStorage,
} from "@/lib/browser-storage";

const getServerSnapshot = (): null => null;

export const useBrowserStorage = (key: string) => {
  const getSnapshot = useCallback(() => readBrowserStorage(key), [key]);
  const value = useSyncExternalStore(
    subscribeBrowserStorage,
    getSnapshot,
    getServerSnapshot
  );
  const setValue = useCallback(
    (next: string | null) => {
      writeBrowserStorage(key, next);
    },
    [key]
  );
  return [value, setValue] as const;
};
