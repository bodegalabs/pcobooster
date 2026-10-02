import { useSyncExternalStore } from "react";

/** A tiny module-level store, so every replica on the page shares one visitor state. */
export const createStore = <T>(initial: T) => {
  let value: T = initial;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      for (const listener of listeners) {
        listener();
      }
    },
    use: <Selected>(select: (state: T) => Selected): Selected =>
      useSyncExternalStore(
        subscribe,
        () => select(value),
        () => select(initial)
      ),
  };
};
