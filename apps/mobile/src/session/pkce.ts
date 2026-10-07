import { base64UrlEncode } from "./base64url";

/** The random bytes and SHA-256 sign-in needs, injected so tests run on Node's crypto. */
export interface SignInCrypto {
  /** `count` cryptographically random bytes. */
  readonly randomBytes: (count: number) => Uint8Array;
  /** SHA-256 of the text's UTF-8 bytes. */
  readonly sha256: (text: string) => Promise<Uint8Array>;
}

/** A PKCE pair (RFC 7636, S256 only). The verifier never leaves the app until the exchange. */
export interface Pkce {
  /** 43 characters of `[A-Za-z0-9_-]`: 32 random bytes, base64url. */
  readonly verifier: string;
  /** `base64url(SHA-256(verifier))`, unpadded: 43 characters. */
  readonly challenge: string;
}

/** The only method the server accepts. */
export const PKCE_METHOD = "S256";

/** 32 random bytes: a 43-character verifier and state, as the server asks for. */
const SECRET_BYTES = 32;

/** A fresh random value for a verifier or `state`: 32 bytes, base64url (43 characters). */
export const randomUrlSafe = (crypto: SignInCrypto): string =>
  base64UrlEncode(crypto.randomBytes(SECRET_BYTES));

export const pkceChallenge = async (
  crypto: SignInCrypto,
  verifier: string
): Promise<string> => base64UrlEncode(await crypto.sha256(verifier));

export const makePkce = async (crypto: SignInCrypto): Promise<Pkce> => {
  const verifier = randomUrlSafe(crypto);
  return { verifier, challenge: await pkceChallenge(crypto, verifier) };
};
