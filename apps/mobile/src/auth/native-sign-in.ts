import { Schema } from "effect";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";

import { base64Url, callbackCode, nativeSessionSchema } from "./protocol";

const randomString = async (): Promise<string> => {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
};
export const signIn = async (origin: string) => {
  const [verifier, state] = await Promise.all([randomString(), randomString()]);
  const challenge = base64Url(
    await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      verifier,
      { encoding: Crypto.CryptoEncoding.BASE64 }
    )
  );
  const redirectUri = __DEV__
    ? "pcobooster-dev://auth/callback"
    : "pcobooster://auth/callback";
  const url = new URL("/api/auth/native/start", origin);
  url.search = new URLSearchParams({
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();
  const result = await WebBrowser.openAuthSessionAsync(
    url.toString(),
    redirectUri,
    { preferEphemeralSession: true }
  );
  if (result.type !== "success") {
    return null;
  }
  const code = callbackCode(result.url, redirectUri, state);
  const response = await fetch(new URL("/api/auth/native/exchange", origin), {
    method: "POST",
    credentials: "omit",
    headers: {
      "content-type": "application/json",
      "x-pcobooster-client": "expo/0.1.0",
    },
    body: JSON.stringify({ code, codeVerifier: verifier }),
  });
  if (response.status === 429) {
    throw new Error(
      "Too many sign-in attempts. Wait a minute, then try again."
    );
  }
  if (!response.ok) {
    throw new Error("That sign-in link expired. Please start again.");
  }
  return Schema.decodeUnknownSync(nativeSessionSchema)(await response.json());
};
export const revokeSession = async (
  origin: string,
  token: string
): Promise<void> => {
  const response = await fetch(new URL("/api/auth/sign-out", origin), {
    method: "POST",
    credentials: "omit",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  if (!response.ok && response.status !== 401) {
    throw new Error("Couldn't sign out of Planning Center. Try again.");
  }
};
