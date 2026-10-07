/**
 * The device side of the session: the Keychain, random bytes and SHA-256, and the ephemeral web
 * authentication session. Everything else in `session/` takes these as plain dependencies.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";

import type { PlainStorage, SecretStorage } from "./credential-store";
import type { WebAuthentication } from "./native-sign-in";
import type { SignInCrypto } from "./pkce";

/**
 * Generic-password items readable after the first unlock, never synced to iCloud, never restored
 * to another device (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`), as the Swift app kept
 * them. The same options go with every call: the accessibility is part of the item's query.
 */
const keychainOptions: SecureStore.SecureStoreOptions = {
  keychainService: "com.pcobooster.session",
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export const keychainStorage: SecretStorage = {
  getItem: async (key) => await SecureStore.getItemAsync(key, keychainOptions),
  setItem: async (key, value) => {
    await SecureStore.setItemAsync(key, value, keychainOptions);
  },
  deleteItem: async (key) => {
    await SecureStore.deleteItemAsync(key, keychainOptions);
  },
};

/** AsyncStorage: preferences, the install marker, and cached reads. Never a token. */
export const appStorage: PlainStorage & {
  readonly removeItem: (key: string) => Promise<void>;
} = {
  getItem: async (key) => await AsyncStorage.getItem(key),
  setItem: async (key, value) => {
    await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key) => {
    await AsyncStorage.removeItem(key);
  },
};

const textEncoder = new TextEncoder();

export const deviceCrypto: SignInCrypto = {
  randomBytes: (count) => Crypto.getRandomBytes(count),
  sha256: async (text) =>
    new Uint8Array(
      await Crypto.digest(
        Crypto.CryptoDigestAlgorithm.SHA256,
        textEncoder.encode(text)
      )
    ),
};

/**
 * `ASWebAuthenticationSession`, ephemeral (no shared Safari cookies), answering only the
 * redirect URI's scheme. Resolves with the callback URL, or null when the person closed it.
 */
export const ephemeralWebAuthentication: WebAuthentication = async (
  startUrl,
  redirectUri
) => {
  const result = await WebBrowser.openAuthSessionAsync(startUrl, redirectUri, {
    preferEphemeralSession: true,
  });
  return result.type === "success" ? result.url : null;
};

/** Deletes every AsyncStorage entry `matches` names (a forgotten person's cached reads). */
export const removeAppStorageKeys = async (
  matches: (key: string) => boolean
): Promise<void> => {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter(matches));
};
