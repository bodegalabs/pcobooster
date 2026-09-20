import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;

const mediaQuery = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

const subscribe = (onStoreChange: () => void): (() => void) => {
  const query = window.matchMedia(mediaQuery);
  query.addEventListener("change", onStoreChange);
  return () => {
    query.removeEventListener("change", onStoreChange);
  };
};

const getSnapshot = (): boolean => window.matchMedia(mediaQuery).matches;

const getServerSnapshot = (): boolean => false;

export const useIsMobile = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
