/**
 * Over-the-air JavaScript updates for the iOS app, served under the Expo Updates protocol v1
 * (https://docs.expo.dev/technical-specs/expo-updates-1/). The publisher
 * (`apps/mobile/scripts/updates`) signs every answer on the operator's Mac and stores it in the
 * stage's update bucket; the API Worker (`packages/api/src/modules/mobile-updates`) only reads it,
 * so it holds no signing key and cannot change what phones run. This module is the stored format
 * and the paths both sides share.
 */
import { Schema } from "effect";

/**
 * Runtime versions are Expo fingerprints, 40 hex characters (`apps/mobile/fingerprint.config.cjs`).
 * Checking the shape also keeps a request from naming any other object in the bucket.
 */
const RUNTIME_VERSION = /^[0-9a-f]{40}$/u;

/** Assets are stored and served under the Base64URL SHA-256 of their bytes, as manifests list it. */
const ASSET_HASH = /^[A-Za-z0-9_-]{43}$/u;

export const isRuntimeVersion = (value: string): boolean =>
  RUNTIME_VERSION.test(value);

export const isAssetHash = (value: string): boolean => ASSET_HASH.test(value);

/** Where the answer for one runtime version's iOS builds is stored. */
export const publishedUpdateKey = (runtimeVersion: string): string =>
  `ios/${runtimeVersion}/current.json`;

/** Where an asset is stored. Assets never change once written: the key is their hash. */
export const assetKey = (hash: string): string => `assets/${hash}`;

/** The path phones download an asset from, under the product origin. */
export const assetPath = (hash: string): `/api/updates/assets/${string}` =>
  `/api/updates/assets/${hash}`;

/** The path phones check for updates at, under the product origin (`apps/mobile/app.config.ts`). */
export const UPDATE_CHECK_PATH = "/api/updates/manifest";

/** The key id the app's certificate is configured with (`codeSigningMetadata`). */
export const SIGNING_KEY_ID = "main";

/** A JSON body exactly as phones receive it, with the signature their certificate checks. */
export const signedBodySchema = Schema.Struct({
  /** The exact text sent; the signature covers these bytes, so it is never re-serialized. */
  body: Schema.String,
  /** Base64 RSASSA-PKCS1-v1_5 SHA-256 signature of `body`. */
  signature: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9+/]+={0,2}$/u)),
});
export type SignedBody = typeof signedBodySchema.Type;

/**
 * What a runtime version's phones are told: run this update, or go back to the JavaScript their
 * build shipped with. Each carries a signed "no update available" answer for phones already
 * running it.
 */
export const publishedUpdateSchema = Schema.Union([
  Schema.TaggedStruct("Update", {
    /** The manifest's `id`. */
    updateId: Schema.String,
    manifest: signedBodySchema,
    noUpdateAvailable: signedBodySchema,
  }),
  Schema.TaggedStruct("RollBackToEmbedded", {
    directive: signedBodySchema,
    noUpdateAvailable: signedBodySchema,
  }),
]);
export type PublishedUpdate = typeof publishedUpdateSchema.Type;

export const decodePublishedUpdate = Schema.decodeUnknownResult(
  Schema.fromJsonString(publishedUpdateSchema)
);
export const encodePublishedUpdate = Schema.encodeSync(
  Schema.fromJsonString(publishedUpdateSchema)
);
