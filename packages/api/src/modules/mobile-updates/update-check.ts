/**
 * The answer to a phone's update check (Expo Updates protocol v1, "Request" and "Response"):
 * the stored, already-signed answer for its runtime version, or "nothing published". Nothing here
 * signs or builds a manifest; see `@pcobooster/contracts/mobile-updates`.
 */
import {
  decodePublishedUpdate,
  isRuntimeVersion,
  publishedUpdateKey,
  SIGNING_KEY_ID,
} from "@pcobooster/contracts/mobile-updates";
import type { SignedBody } from "@pcobooster/contracts/mobile-updates";
import { Data, Effect, Result } from "effect";

import type { UpdateStore } from "./update-store";

/** The headers of an update check that decide its answer. */
export interface UpdateCheck {
  readonly protocolVersion: string | undefined;
  readonly platform: string | undefined;
  readonly runtimeVersion: string | undefined;
  /** The update the phone is running; the embedded one's id when it runs its build's own code. */
  readonly currentUpdateId: string | undefined;
  /** The id of the update its build shipped with. */
  readonly embeddedUpdateId: string | undefined;
}

export type UpdateAnswer =
  | {
      readonly _tag: "Rejected";
      readonly status: 400 | 406;
      readonly message: string;
    }
  | { readonly _tag: "NothingPublished" }
  | {
      readonly _tag: "Signed";
      readonly part: "manifest" | "directive";
      readonly signed: SignedBody;
      /** What the phone is told, for the request log. */
      readonly outcome: "update" | "rollBackToEmbedded" | "noUpdateAvailable";
    };

/** A stored answer does not decode: the publisher wrote something this server cannot serve. */
export class PublishedUpdateUnreadable extends Data.TaggedError(
  "PublishedUpdateUnreadable"
)<{ readonly key: string }> {}

const rejected = (status: 400 | 406, message: string): UpdateAnswer => ({
  _tag: "Rejected",
  status,
  message,
});

/** The stored key a valid check reads, or why the check is refused. */
const checkedKey = (
  check: UpdateCheck
): Result.Result<string, UpdateAnswer> => {
  if (check.protocolVersion !== "1") {
    return Result.fail(rejected(406, "Expected expo-protocol-version 1."));
  }
  if (check.platform !== "ios") {
    return Result.fail(rejected(400, "Updates are published for iOS only."));
  }
  if (
    check.runtimeVersion === undefined ||
    !isRuntimeVersion(check.runtimeVersion)
  ) {
    return Result.fail(
      rejected(400, "Expected an expo-runtime-version fingerprint.")
    );
  }
  return Result.succeed(publishedUpdateKey(check.runtimeVersion));
};

export const answerUpdateCheck = Effect.fn("answerUpdateCheck")(
  function* answerUpdateCheck(check: UpdateCheck, store: UpdateStore) {
    const key = checkedKey(check);
    if (Result.isFailure(key)) {
      return key.failure;
    }
    const stored = yield* store.readText(key.success);
    if (stored === null) {
      return { _tag: "NothingPublished" } satisfies UpdateAnswer;
    }
    const published = decodePublishedUpdate(stored);
    if (Result.isFailure(published)) {
      return yield* new PublishedUpdateUnreadable({ key: key.success });
    }
    const update = published.success;
    const alreadyRunning =
      update._tag === "Update"
        ? check.currentUpdateId === update.updateId
        : check.currentUpdateId !== undefined &&
          check.currentUpdateId === check.embeddedUpdateId;
    if (alreadyRunning) {
      return {
        _tag: "Signed",
        part: "directive",
        signed: update.noUpdateAvailable,
        outcome: "noUpdateAvailable",
      } satisfies UpdateAnswer;
    }
    return update._tag === "Update"
      ? ({
          _tag: "Signed",
          part: "manifest",
          signed: update.manifest,
          outcome: "update",
        } satisfies UpdateAnswer)
      : ({
          _tag: "Signed",
          part: "directive",
          signed: update.directive,
          outcome: "rollBackToEmbedded",
        } satisfies UpdateAnswer);
  }
);

/** An HTTP answer as bytes on the wire, independent of the server framework. */
export interface RenderedUpdateAnswer {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

const PROTOCOL_HEADERS = {
  "expo-protocol-version": "1",
  "expo-sfv-version": "0",
} as const;

/**
 * Renders an answer. A signed body is the one part of a `multipart/mixed` response, with its
 * signature as an `expo-signature` structured-field dictionary; "nothing published" is a 204,
 * which phones read as no update. `boundary` must not occur in the body; JSON bodies cannot
 * contain the hyphenated random boundaries callers pass.
 */
export const renderUpdateAnswer = (
  answer: UpdateAnswer,
  boundary: string
): RenderedUpdateAnswer => {
  if (answer._tag === "Rejected") {
    return {
      status: answer.status,
      headers: {
        ...PROTOCOL_HEADERS,
        "content-type": "text/plain; charset=utf-8",
      },
      body: answer.message,
    };
  }
  if (answer._tag === "NothingPublished") {
    return { status: 204, headers: PROTOCOL_HEADERS, body: "" };
  }
  const part = [
    `--${boundary}`,
    `content-disposition: form-data; name="${answer.part}"`,
    "content-type: application/json; charset=utf-8",
    `expo-signature: sig="${answer.signed.signature}", keyid="${SIGNING_KEY_ID}"`,
    "",
    answer.signed.body,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return {
    status: 200,
    headers: {
      ...PROTOCOL_HEADERS,
      "content-type": `multipart/mixed; boundary=${boundary}`,
    },
    body: part,
  };
};
