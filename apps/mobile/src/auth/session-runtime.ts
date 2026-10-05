import { Schema } from "effect";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import { reportError } from "../errors";
import { captureNativeEvent, nativeErrorCode } from "../native-analytics";
import { revokeSession, signIn } from "./native-sign-in";
import { NativeSessionStore } from "./session-store";

export const createNativeSessionStore = (): NativeSessionStore => {
  const origin = Schema.decodeUnknownSync(Schema.String)(
    process.env.EXPO_PUBLIC_API_URL ?? "https://pcobooster.com"
  );
  return new NativeSessionStore({
    origin,
    reportError,
    storage: {
      getItem: SecureStore.getItemAsync,
      setItem: async (key, value) => {
        await SecureStore.setItemAsync(key, value, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      },
    },
    digest: async (value) =>
      await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        value
      ),
    authenticate: async () => {
      captureNativeEvent("sign_in_started", { operation: "sign_in" });
      try {
        const result = await signIn(origin);
        if (result === null) {
          captureNativeEvent("sign_in_failed", {
            operation: "sign_in",
            errorCode: "SIGN_IN_CANCELLED",
          });
        } else {
          captureNativeEvent("workflow_completed", { operation: "sign_in" });
        }
        return result;
      } catch (error) {
        captureNativeEvent("sign_in_failed", {
          operation: "sign_in",
          errorCode: nativeErrorCode(
            error instanceof Error ? error : new Error("Sign-in failed")
          ),
        });
        throw error;
      }
    },
    revoke: async (token) => {
      await revokeSession(origin, token);
    },
  });
};
