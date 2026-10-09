/**
 * What an update publish stores, built from an `expo export` of one revision: the Expo Updates
 * manifest (protocol v1, "Manifest body"), the files phones download, and the signed answers the
 * API Worker serves (`@pcobooster/contracts/mobile-updates`). Pure: callers read the files and
 * supply the signer.
 */
import { createHash } from "node:crypto";

import { assetPath } from "@pcobooster/contracts/mobile-updates";
import type { PublishedUpdate } from "@pcobooster/contracts/mobile-updates";
import { Schema } from "effect";

/** What `expo export --platform ios` writes to `metadata.json`. */
export const exportMetadataSchema = Schema.Struct({
  fileMetadata: Schema.Struct({
    ios: Schema.Struct({
      bundle: Schema.String,
      assets: Schema.Array(
        Schema.Struct({ path: Schema.String, ext: Schema.String })
      ),
    }),
  }),
});
export const decodeExportMetadata = Schema.decodeUnknownSync(
  Schema.fromJsonString(exportMetadataSchema)
);

/**
 * The public app config (`expo config --type public --json`), which `expo-constants` serves as
 * `expoConfig` when an update runs, so it travels in the manifest.
 */
export const publicAppConfigSchema = Schema.Record(Schema.String, Schema.Json);
export type PublicAppConfig = typeof publicAppConfigSchema.Type;
export const decodePublicAppConfig = Schema.decodeUnknownSync(
  Schema.fromJsonString(publicAppConfigSchema)
);

/** One file of the export, read from disk. */
export interface ExportedFile {
  /** Its path, as `metadata.json` names it. */
  readonly path: string;
  readonly bytes: Uint8Array;
  /** Its extension without the dot; the launch bundle has none. */
  readonly ext?: string;
}

/** A manifest asset (protocol "Asset"). */
export interface ManifestAsset {
  /** Base64URL SHA-256 of the bytes; phones check it, and the bucket stores the file under it. */
  readonly hash: string;
  /** MD5 hex of the bytes, the key Expo gives the same file in a build's embedded update. */
  readonly key: string;
  readonly contentType: string;
  readonly fileExtension?: string;
  readonly url: string;
}

export interface UpdateManifest {
  readonly id: string;
  readonly createdAt: string;
  readonly runtimeVersion: string;
  readonly launchAsset: ManifestAsset;
  readonly assets: readonly ManifestAsset[];
  readonly metadata: Readonly<Record<string, string>>;
  readonly extra: {
    readonly expoClient: PublicAppConfig;
    /** The commit the update was exported from. */
    readonly revision: string;
  };
}

/** A file to store in the bucket under its hash. */
export interface Upload {
  readonly hash: string;
  readonly path: string;
  readonly contentType: string;
}

/** Content types by extension for the assets the app bundles; anything else is opaque bytes. */
const CONTENT_TYPES = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["svg", "image/svg+xml"],
  ["ttf", "font/ttf"],
  ["otf", "font/otf"],
  ["json", "application/json"],
  ["mp4", "video/mp4"],
  ["mp3", "audio/mpeg"],
  ["m4a", "audio/mp4"],
  ["wav", "audio/wav"],
]);

const BUNDLE_CONTENT_TYPE = "application/javascript";

export const sha256Base64Url = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("base64url");

const md5Hex = (bytes: Uint8Array): string =>
  createHash("md5").update(bytes).digest("hex");

/**
 * The update's id: a UUID from its publish time and content (runtime version, app config, and
 * every file). Each publish is a new update even when the JavaScript did not change: a phone keeps
 * the time it first stored an id, so republishing an update after a rollback under the same id
 * would never reach the phones that had run it. Files are still stored and downloaded once, by
 * hash. Version 4 and variant bits are set so it is a well-formed UUID.
 */
export const updateIdFor = (
  createdAt: Date,
  runtimeVersion: string,
  expoClient: PublicAppConfig,
  files: readonly ExportedFile[]
): string => {
  const digest = createHash("sha256");
  digest.update(createdAt.toISOString());
  digest.update(runtimeVersion);
  digest.update(JSON.stringify(expoClient));
  for (const file of files) {
    digest.update(sha256Base64Url(file.bytes));
  }
  const hex = digest.digest("hex");
  const variant = ((Number.parseInt(hex[16] ?? "0", 16) % 4) + 8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
};

/** A file as the manifest lists it and as the bucket stores it. */
interface DescribedFile {
  readonly asset: ManifestAsset;
  readonly upload: Upload;
}

const describe = (
  file: ExportedFile,
  origin: string,
  launch: boolean
): DescribedFile => {
  const hash = sha256Base64Url(file.bytes);
  const contentType = launch
    ? BUNDLE_CONTENT_TYPE
    : (CONTENT_TYPES.get(file.ext ?? "") ?? "application/octet-stream");
  const listed = {
    hash,
    key: md5Hex(file.bytes),
    contentType,
    url: `${origin}${assetPath(hash)}`,
  };
  // The protocol ignores the launch asset's extension.
  const asset: ManifestAsset =
    launch || file.ext === undefined
      ? listed
      : { ...listed, fileExtension: `.${file.ext}` };
  return { asset, upload: { hash, path: file.path, contentType } };
};

export interface ManifestInput {
  readonly runtimeVersion: string;
  readonly createdAt: Date;
  /** The product origin phones download assets from. */
  readonly origin: string;
  readonly revision: string;
  readonly expoClient: PublicAppConfig;
  readonly launch: ExportedFile;
  readonly assets: readonly ExportedFile[];
}

/** An update as published: its manifest, and the files the bucket stores for it. */
export interface BuiltUpdate {
  readonly manifest: UpdateManifest;
  readonly uploads: readonly Upload[];
}

export const buildManifest = (input: ManifestInput): BuiltUpdate => {
  const launch = describe(input.launch, input.origin, true);
  const assets = input.assets.map((file) =>
    describe(file, input.origin, false)
  );
  return {
    manifest: {
      id: updateIdFor(input.createdAt, input.runtimeVersion, input.expoClient, [
        input.launch,
        ...input.assets,
      ]),
      createdAt: input.createdAt.toISOString(),
      runtimeVersion: input.runtimeVersion,
      launchAsset: launch.asset,
      assets: assets.map(({ asset }) => asset),
      metadata: {},
      extra: { expoClient: input.expoClient, revision: input.revision },
    },
    uploads: [launch.upload, ...assets.map(({ upload }) => upload)],
  };
};

/** Signs a body with the update key: base64 RSASSA-PKCS1-v1_5 SHA-256. */
export type Sign = (body: string) => string;

const NO_UPDATE_AVAILABLE = JSON.stringify({ type: "noUpdateAvailable" });

const signed = (body: string, sign: Sign) => ({
  body,
  signature: sign(body),
});

/** The stored answer that sends `manifest` to every phone of its runtime version. */
export const publishedUpdate = (
  manifest: UpdateManifest,
  sign: Sign
): PublishedUpdate => ({
  _tag: "Update",
  updateId: manifest.id,
  manifest: signed(JSON.stringify(manifest), sign),
  noUpdateAvailable: signed(NO_UPDATE_AVAILABLE, sign),
});

/**
 * The stored answer that sends phones of a runtime version back to the JavaScript their build
 * shipped with. Phones apply it when `commitTime` is newer than the update they run.
 */
export const publishedRollBack = (
  commitTime: Date,
  sign: Sign
): PublishedUpdate => ({
  _tag: "RollBackToEmbedded",
  directive: signed(
    JSON.stringify({
      type: "rollBackToEmbedded",
      parameters: { commitTime: commitTime.toISOString() },
    }),
    sign
  ),
  noUpdateAvailable: signed(NO_UPDATE_AVAILABLE, sign),
});
