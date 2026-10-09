/**
 * Asks the deployed update route what phones of a runtime version get, as a phone does, and checks
 * it end to end: the published answer, signed with a key the builds' certificate accepts, every
 * asset downloadable with the hash the manifest lists, and "no update available" for a phone that
 * already runs it.
 */
import { UPDATE_CHECK_PATH } from "@pcobooster/contracts/mobile-updates";
import { Schema } from "effect";

import { sha256Base64Url } from "./update-manifest";
import type { Verify } from "./update-signing";

/** One part of a `multipart/mixed` answer. */
export interface AnswerPart {
  readonly name: string;
  readonly signature: string | undefined;
  readonly body: string;
}

const CRLF = "\r\n";
const HEADER_END = `${CRLF}${CRLF}`;
const PART_NAME = /name="(?<name>[^"]+)"/u;
const SIGNATURE = /sig="(?<sig>[^"]+)"/u;
const BOUNDARY = /boundary=(?<boundary>[^;\s]+)/u;

/** One part between delimiters: its headers, a blank line, and its body. */
const readPart = (chunk: string): AnswerPart => {
  const part = chunk.startsWith(CRLF) ? chunk.slice(CRLF.length) : chunk;
  const split = part.indexOf(HEADER_END);
  const headers = part.slice(0, split).split(CRLF);
  const content = part.slice(split + HEADER_END.length);
  const header = (name: string) =>
    headers
      .find((line) => line.toLowerCase().startsWith(`${name}:`))
      ?.slice(name.length + 1)
      .trim();
  return {
    name:
      PART_NAME.exec(header("content-disposition") ?? "")?.groups?.name ?? "",
    signature: SIGNATURE.exec(header("expo-signature") ?? "")?.groups?.sig,
    body: content.endsWith(CRLF) ? content.slice(0, -CRLF.length) : content,
  };
};

/** The parts of a `multipart/mixed` body (RFC 2046), as `expo-updates` reads them. */
export const parseMultipart = (
  contentType: string,
  body: string
): readonly AnswerPart[] => {
  const boundary = BOUNDARY.exec(contentType)?.groups?.boundary;
  if (boundary === undefined) {
    throw new Error(`Not a multipart answer: ${contentType}`);
  }
  const parts: AnswerPart[] = [];
  // Before the first delimiter is the preamble; a chunk starting `--` follows the closing one.
  for (const chunk of body.split(`--${boundary}`).slice(1)) {
    if (!chunk.startsWith("--")) {
      parts.push(readPart(chunk));
    }
  }
  return parts;
};

const decodeUpdateSummary = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      id: Schema.String,
      createdAt: Schema.String,
      extra: Schema.Struct({ revision: Schema.String }),
    })
  )
);
const decodeDirective = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      type: Schema.String,
      parameters: Schema.optional(
        Schema.Struct({ commitTime: Schema.optional(Schema.String) })
      ),
    })
  )
);

const manifestAssetsSchema = Schema.Struct({
  launchAsset: Schema.Struct({ hash: Schema.String, url: Schema.String }),
  assets: Schema.Array(
    Schema.Struct({ hash: Schema.String, url: Schema.String })
  ),
});
const decodeManifestAssets = Schema.decodeUnknownSync(
  Schema.fromJsonString(manifestAssetsSchema)
);

/** What the route should now answer: these exact signed bodies. */
export type ExpectedAnswer =
  | {
      readonly kind: "update";
      readonly updateId: string;
      readonly manifest: string;
      readonly noUpdateAvailable: string;
    }
  | {
      readonly kind: "rollBackToEmbedded";
      readonly directive: string;
      readonly noUpdateAvailable: string;
    };

export interface LiveCheckInput {
  readonly origin: string;
  readonly runtimeVersion: string;
  readonly expected: ExpectedAnswer;
  readonly verify: Verify;
  readonly fetch: typeof globalThis.fetch;
}

/** A phone's id for the update it runs that matches nothing published. */
const OTHER_UPDATE_ID = "00000000-0000-4000-8000-000000000000";
const EMBEDDED_UPDATE_ID = "00000000-0000-4000-8000-000000000001";

/** Where and how to ask: the origin, the runtime version, the certificate, and `fetch`. */
export type PhoneRequest = Omit<LiveCheckInput, "expected">;

const requestAsPhone = async (
  input: PhoneRequest,
  currentUpdateId: string
): Promise<Response> =>
  await input.fetch(`${input.origin}${UPDATE_CHECK_PATH}`, {
    headers: {
      accept: "multipart/mixed",
      "expo-protocol-version": "1",
      "expo-platform": "ios",
      "expo-runtime-version": input.runtimeVersion,
      "expo-expect-signature": 'sig, keyid="main", alg="rsa-v1_5-sha256"',
      "expo-current-update-id": currentUpdateId,
      "expo-embedded-update-id": EMBEDDED_UPDATE_ID,
    },
  });

const askAsPhone = async (
  input: PhoneRequest,
  currentUpdateId: string
): Promise<AnswerPart> => {
  const response = await requestAsPhone(input, currentUpdateId);
  if (response.status !== 200) {
    throw new Error(
      `The update check answered ${response.status}, not the published update.`
    );
  }
  const parts = parseMultipart(
    response.headers.get("content-type") ?? "",
    await response.text()
  );
  const [part] = parts;
  if (parts.length !== 1 || part === undefined) {
    throw new Error(`Expected one part, got ${parts.length}.`);
  }
  if (
    part.signature === undefined ||
    !input.verify(part.body, part.signature)
  ) {
    throw new Error(
      `The ${part.name} part is not signed by the key the builds' certificate accepts.`
    );
  }
  return part;
};

const expectPart = (
  part: AnswerPart,
  name: string,
  body: string,
  what: string
): void => {
  if (part.name !== name || part.body !== body) {
    throw new Error(`The route does not serve ${what} yet.`);
  }
};

/** What a live check verified, in order. */
export interface LiveCheckReport {
  readonly answers: readonly string[];
  /** Assets downloaded whose bytes matched the manifest's hash. */
  readonly assets: number;
}

const verifiedAsset = async (
  input: LiveCheckInput,
  asset: { readonly hash: string; readonly url: string }
): Promise<void> => {
  const response = await input.fetch(asset.url);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (response.status !== 200 || sha256Base64Url(bytes) !== asset.hash) {
    throw new Error(
      `${asset.url} answered ${response.status} with bytes that do not match its hash.`
    );
  }
};

/** Resolves once the live route serves exactly the expected answers; throws on the first gap. */
export const checkLiveUpdate = async (
  input: LiveCheckInput
): Promise<LiveCheckReport> => {
  const { expected } = input;
  if (expected.kind === "update") {
    expectPart(
      await askAsPhone(input, OTHER_UPDATE_ID),
      "manifest",
      expected.manifest,
      "the published manifest"
    );
    expectPart(
      await askAsPhone(input, expected.updateId),
      "directive",
      expected.noUpdateAvailable,
      "no update to phones already running it"
    );
    const { launchAsset, assets } = decodeManifestAssets(expected.manifest);
    const files = [launchAsset, ...assets];
    await Promise.all(
      files.map(async (asset) => {
        await verifiedAsset(input, asset);
      })
    );
    return {
      answers: ["manifest", "noUpdateAvailable to phones running it"],
      assets: files.length,
    };
  }
  expectPart(
    await askAsPhone(input, OTHER_UPDATE_ID),
    "directive",
    expected.directive,
    "the rollback"
  );
  expectPart(
    await askAsPhone(input, EMBEDDED_UPDATE_ID),
    "directive",
    expected.noUpdateAvailable,
    "no update to phones on their build's own code"
  );
  return {
    answers: [
      "rollBackToEmbedded",
      "noUpdateAvailable to phones on their build's code",
    ],
    assets: 0,
  };
};

/** What the route tells a phone of a runtime version that runs other code than what is published. */
export type LiveAnswer =
  | { readonly kind: "nothing" }
  | {
      readonly kind: "update";
      readonly updateId: string;
      readonly createdAt: string;
      readonly revision: string;
      readonly signatureVerifies: boolean;
    }
  | {
      readonly kind: "directive";
      readonly type: string;
      readonly commitTime: string | null;
      readonly signatureVerifies: boolean;
    };

/** Reads what a runtime version's phones are told now, without judging it. */
export const readLiveAnswer = async (
  input: PhoneRequest
): Promise<LiveAnswer> => {
  const response = await requestAsPhone(input, OTHER_UPDATE_ID);
  if (response.status === 204) {
    return { kind: "nothing" };
  }
  const body = await response.text();
  if (response.status !== 200) {
    throw new Error(`The update check answered ${response.status}: ${body}`);
  }
  const [part] = parseMultipart(
    response.headers.get("content-type") ?? "",
    body
  );
  if (part === undefined) {
    throw new Error("The update check answered with no parts.");
  }
  const signatureVerifies =
    part.signature !== undefined && input.verify(part.body, part.signature);
  if (part.name === "manifest") {
    const update = decodeUpdateSummary(part.body);
    return {
      kind: "update",
      updateId: update.id,
      createdAt: update.createdAt,
      revision: update.extra.revision,
      signatureVerifies,
    };
  }
  const directive = decodeDirective(part.body);
  return {
    kind: "directive",
    type: directive.type,
    commitTime: directive.parameters?.commitTime ?? null,
    signatureVerifies,
  };
};
