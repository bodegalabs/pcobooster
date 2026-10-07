/**
 * Read-only App Store Connect API access for releases: the app, every build number it has
 * (processed builds and in-flight uploads), and one build's processing and TestFlight state.
 * Never writes. https://developer.apple.com/documentation/appstoreconnectapi
 */
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

import { Schema } from "effect";

const API = "https://api.appstoreconnect.apple.com";
/** Apple accepts tokens that live at most 20 minutes. */
const TOKEN_LIFETIME_S = 1200;
const PAGE_LIMIT = "200";
const POSITIVE_INTEGER = /^[1-9]\d*$/u;

export interface AscKey {
  readonly keyId: string;
  readonly issuerId: string;
  /** The `.p8` file's PEM text. */
  readonly privateKey: string;
}

/**
 * The key `ASC_KEY_ID`, `ASC_ISSUER_ID`, and one of `ASC_KEY_PATH` or `ASC_KEY_P8_BASE64` supply,
 * or null when none is set. A base64 key is decoded in memory and never written to disk.
 */
export const ascKeyFromEnv = (
  env: Readonly<Record<string, string | undefined>>
): AscKey | null => {
  const keyId = env.ASC_KEY_ID ?? "";
  const issuerId = env.ASC_ISSUER_ID ?? "";
  const keyPath = env.ASC_KEY_PATH ?? "";
  const keyBase64 = env.ASC_KEY_P8_BASE64 ?? "";
  if (`${keyId}${issuerId}${keyPath}${keyBase64}` === "") {
    return null;
  }
  if (
    keyId === "" ||
    issuerId === "" ||
    (keyPath === "") === (keyBase64 === "")
  ) {
    throw new Error(
      "Supply ASC_KEY_ID, ASC_ISSUER_ID, and one of ASC_KEY_PATH or ASC_KEY_P8_BASE64."
    );
  }
  return {
    keyId,
    issuerId,
    privateKey:
      keyPath === ""
        ? Buffer.from(keyBase64, "base64").toString("utf-8")
        : readFileSync(keyPath, "utf-8"),
  };
};

const base64url = (value: string | Buffer): string =>
  Buffer.from(value).toString("base64url");

/** An ES256 App Store Connect token. */
export const ascToken = (key: AscKey, now: Date): string => {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = base64url(
    JSON.stringify({ alg: "ES256", kid: key.keyId, typ: "JWT" })
  );
  const payload = base64url(
    JSON.stringify({
      iss: key.issuerId,
      iat: issuedAt,
      exp: issuedAt + TOKEN_LIFETIME_S,
      aud: "appstoreconnect-v1",
    })
  );
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: createPrivateKey(key.privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${payload}.${base64url(signature)}`;
};

const RelatedSchema = Schema.Struct({ id: Schema.String, type: Schema.String });
const RelatedListSchema = Schema.Array(RelatedSchema);
const isRelatedList = Schema.is(RelatedListSchema);
const isBoolean = Schema.is(Schema.Boolean);

const ResourceSchema = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  attributes: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
  relationships: Schema.optional(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        data: Schema.optional(
          Schema.NullOr(Schema.Union([RelatedSchema, RelatedListSchema]))
        ),
      })
    )
  ),
});
type Resource = typeof ResourceSchema.Type;

const PageSchema = Schema.Struct({
  data: Schema.Array(ResourceSchema),
  included: Schema.optional(Schema.Array(ResourceSchema)),
  links: Schema.optional(
    Schema.Struct({ next: Schema.optional(Schema.String) })
  ),
});
type Page = typeof PageSchema.Type;

const decodePage = Schema.decodeUnknownSync(PageSchema);

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface AscClient {
  /** Every resource across all pages of a list request. */
  readonly list: (
    path: string,
    query: Readonly<Record<string, string>>
  ) => Promise<{ readonly data: Resource[]; readonly included: Resource[] }>;
}

export const makeAscClient = (
  key: AscKey,
  fetch: Fetch = globalThis.fetch,
  now: () => Date = () => new Date()
): AscClient => ({
  list: async (path, query) => {
    const data: Resource[] = [];
    const included: Resource[] = [];
    let next: string | undefined =
      `${API}${path}?${new URLSearchParams(query).toString()}`;
    while (next !== undefined) {
      if (!next.startsWith(`${API}/`)) {
        throw new Error(`App Store Connect paged outside its API: ${next}`);
      }
      // Pages are sequential: each one names the next.
      // oxlint-disable-next-line no-await-in-loop
      const response = await fetch(next, {
        headers: { authorization: `Bearer ${ascToken(key, now())}` },
      });
      // oxlint-disable-next-line no-await-in-loop
      const body: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          `App Store Connect answered ${response.status} for ${path}: ${JSON.stringify(body)}`
        );
      }
      const page: Page = decodePage(body);
      data.push(...page.data);
      included.push(...(page.included ?? []));
      next = page.links?.next;
    }
    return { data, included };
  },
});

const isString = Schema.is(Schema.String);

const attribute = (resource: Resource, name: string): string | null => {
  const value = resource.attributes?.[name];
  return isString(value) ? value : null;
};

/** The App Store Connect app id for a bundle identifier. */
export const findAppId = async (
  client: AscClient,
  bundleId: string
): Promise<string> => {
  const { data } = await client.list("/v1/apps", {
    "filter[bundleId]": bundleId,
    "fields[apps]": "bundleId",
  });
  const app = data.find(
    (resource) => attribute(resource, "bundleId") === bundleId
  );
  if (app === undefined) {
    throw new Error(
      `App Store Connect has no app with bundle identifier ${bundleId}`
    );
  }
  return app.id;
};

/**
 * Every iOS build number App Store Connect knows for the app: processed or expired builds, and
 * uploads still being delivered or processed (which do not list as builds yet).
 */
export const takenBuildNumbers = async (
  client: AscClient,
  appId: string
): Promise<number[]> => {
  const [builds, uploads] = await Promise.all([
    client.list("/v1/builds", {
      "filter[app]": appId,
      "filter[preReleaseVersion.platform]": "IOS",
      "fields[builds]": "version",
      limit: PAGE_LIMIT,
    }),
    client.list(`/v1/apps/${appId}/buildUploads`, {
      "filter[platform]": "IOS",
      "fields[buildUploads]": "cfBundleVersion,state",
      limit: PAGE_LIMIT,
    }),
  ]);
  const versions = [
    ...builds.data.map((build) => attribute(build, "version")),
    ...uploads.data.map((upload) => attribute(upload, "cfBundleVersion")),
  ];
  return versions
    .filter(
      (version): version is string =>
        version !== null && POSITIVE_INTEGER.test(version)
    )
    .map(Number);
};

export interface BuildState {
  readonly buildId: string;
  readonly version: string | null;
  readonly shortVersion: string | null;
  readonly processingState: string | null;
  readonly uploadedDate: string | null;
  readonly expired: boolean | null;
  readonly internalBuildState: string | null;
  readonly externalBuildState: string | null;
  readonly betaGroups: readonly string[];
}

const relatedIds = (resource: Resource, name: string): string[] => {
  const related = resource.relationships?.[name]?.data;
  if (related === undefined || related === null) {
    return [];
  }
  return isRelatedList(related) ? related.map((item) => item.id) : [related.id];
};

/** One build's processing state, its TestFlight states, and the beta groups it is in. */
export const buildState = async (
  client: AscClient,
  appId: string,
  build: number
): Promise<BuildState | null> => {
  const { data, included } = await client.list("/v1/builds", {
    "filter[app]": appId,
    "filter[version]": String(build),
    "filter[preReleaseVersion.platform]": "IOS",
    include: "preReleaseVersion,buildBetaDetail,betaGroups",
    "fields[builds]":
      "version,processingState,uploadedDate,expired,preReleaseVersion,buildBetaDetail,betaGroups",
    "fields[preReleaseVersions]": "version",
    "fields[buildBetaDetails]": "internalBuildState,externalBuildState",
    "fields[betaGroups]": "name",
  });
  const [found] = data;
  if (found === undefined) {
    return null;
  }
  const byId = (type: string, id: string) =>
    included.find((resource) => resource.type === type && resource.id === id);
  const [releaseId] = relatedIds(found, "preReleaseVersion");
  const [detailId] = relatedIds(found, "buildBetaDetail");
  const release =
    releaseId === undefined ? undefined : byId("preReleaseVersions", releaseId);
  const detail =
    detailId === undefined ? undefined : byId("buildBetaDetails", detailId);
  const expired = found.attributes?.expired;
  return {
    buildId: found.id,
    version: attribute(found, "version"),
    shortVersion: release === undefined ? null : attribute(release, "version"),
    processingState: attribute(found, "processingState"),
    uploadedDate: attribute(found, "uploadedDate"),
    expired: isBoolean(expired) ? expired : null,
    internalBuildState:
      detail === undefined ? null : attribute(detail, "internalBuildState"),
    externalBuildState:
      detail === undefined ? null : attribute(detail, "externalBuildState"),
    betaGroups: relatedIds(found, "betaGroups").map((id) => {
      const group = byId("betaGroups", id);
      return (group === undefined ? null : attribute(group, "name")) ?? id;
    }),
  };
};
