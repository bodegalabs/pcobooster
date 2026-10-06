/**
 * Demo links arrive through expo-router's `+native-intent` before (or while) the app is mounted;
 * the inbox holds the latest one until the session provider takes it.
 */
type Listener = (key: string) => void;

let pending: string | null = null;
let listener: Listener | null = null;

/** Hands a demo key to the app, now or once it is listening. */
export const deliverDemoKey = (key: string): void => {
  if (listener === null) {
    pending = key;
    return;
  }
  listener(key);
};

/** Receives demo keys, starting with one that arrived before the app was ready. */
export const receiveDemoKeys = (next: Listener): (() => void) => {
  listener = next;
  if (pending !== null) {
    const key = pending;
    pending = null;
    next(key);
    return () => {
      if (listener === next) {
        listener = null;
      }
    };
  }
  return () => {
    if (listener === next) {
      listener = null;
    }
  };
};
