const STORAGE_CHANGE_EVENT = "pcobooster:storage-change";
const memoryFallback = new Map<string, string | null>();

export const readBrowserStorage = (key: string): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  if (memoryFallback.has(key)) {
    return memoryFallback.get(key) ?? null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const writeBrowserStorage = (
  key: string,
  value: string | null
): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
    memoryFallback.delete(key);
  } catch {
    // Keep preferences usable for this session when browser storage is blocked.
    memoryFallback.set(key, value);
  }
  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
};

export const subscribeBrowserStorage = (onChange: () => void): (() => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener(STORAGE_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(STORAGE_CHANGE_EVENT, onChange);
  };
};
