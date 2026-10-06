import { Option, Schema } from "effect";

import { emptySession, StoredSessionJson } from "./device-session";
import type { StoredSession } from "./device-session";

/** Secret storage by key: the Keychain in the app (`secure-storage.ts`), a map in tests. */
export interface SecretStorage {
  readonly getItem: (key: string) => Promise<string | null>;
  readonly setItem: (key: string, value: string) => Promise<void>;
  readonly deleteItem: (key: string) => Promise<void>;
}

/** Plain app storage (AsyncStorage), which an uninstall erases. Never holds a token. */
export interface PlainStorage {
  readonly getItem: (key: string) => Promise<string | null>;
  readonly setItem: (key: string, value: string) => Promise<void>;
}

/** The one Keychain item holding the device's accounts, tokens, and demo session. */
export const SESSION_ITEM_KEY = "pcobooster.device-session.v1";
/** Marks this install as seen, in plain storage. */
export const INSTALL_MARKER_KEY = "pcobooster.install-marker.v1";

const decodeSession = Schema.decodeUnknownOption(StoredSessionJson);
const encodeSession = Schema.encodeSync(StoredSessionJson);

export interface CredentialStore {
  /** The saved session; empty when none is saved, or when the item is unreadable (then deleted). */
  readonly load: () => Promise<StoredSession>;
  readonly save: (session: StoredSession) => Promise<void>;
}

export const makeCredentialStore = (
  secrets: SecretStorage,
  key: string = SESSION_ITEM_KEY
): CredentialStore => ({
  load: async () => {
    const raw = await secrets.getItem(key);
    if (raw === null) {
      return emptySession;
    }
    const decoded = decodeSession(raw);
    if (Option.isNone(decoded)) {
      // A person signs in again rather than staying stuck on a corrupt item.
      await secrets.deleteItem(key);
      return emptySession;
    }
    return decoded.value;
  },
  save: async (session) => {
    if (session.accounts.length === 0 && session.demo === null) {
      await secrets.deleteItem(key);
      return;
    }
    await secrets.setItem(key, encodeSession(session));
  },
});

/**
 * Keychain items survive deleting the app. On the first launch of a new install, forget them, so
 * a reinstalled app starts signed out. Returns true when it cleared.
 */
export const clearIfFreshInstall = async (
  secrets: SecretStorage,
  plain: PlainStorage
): Promise<boolean> => {
  if ((await plain.getItem(INSTALL_MARKER_KEY)) !== null) {
    return false;
  }
  await secrets.deleteItem(SESSION_ITEM_KEY);
  await plain.setItem(INSTALL_MARKER_KEY, "1");
  return true;
};

/** Secret storage in memory: tests, and the fixture harness (nothing touches the Keychain). */
export const memorySecretStorage = (
  initial: Readonly<Record<string, string>> = {}
): SecretStorage & { readonly items: Map<string, string> } => {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: async (key) => await Promise.resolve(items.get(key) ?? null),
    setItem: async (key, value) => {
      items.set(key, value);
      await Promise.resolve();
    },
    deleteItem: async (key) => {
      items.delete(key);
      await Promise.resolve();
    },
  };
};
