import { encodePublishedUpdate } from "@pcobooster/contracts/mobile-updates";
import type { PublishedUpdate } from "@pcobooster/contracts/mobile-updates";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  answerUpdateCheck,
  PublishedUpdateUnreadable,
  renderUpdateAnswer,
} from "./update-check";
import type { UpdateCheck } from "./update-check";
import { UpdateStoreUnavailable } from "./update-store";
import type { UpdateStore } from "./update-store";

const RUNTIME = "26d8f75d228029e1bf0e5b295511ca1b76c3f825";
const UPDATE_ID = "0b6c1e9a-58d4-4a5e-9d33-6f1c2b7e8a10";
const EMBEDDED_ID = "5f0f8c3e-2d1b-4c7a-8e9f-0a1b2c3d4e5f";

const manifestBody = `{"id":"${UPDATE_ID}","runtimeVersion":"${RUNTIME}"}`;
const noUpdateBody = '{"type":"noUpdateAvailable"}';
const rollBackBody =
  '{"type":"rollBackToEmbedded","parameters":{"commitTime":"2026-10-08T20:00:00.000Z"}}';

const update: PublishedUpdate = {
  _tag: "Update",
  updateId: UPDATE_ID,
  manifest: { body: manifestBody, signature: "bWFuaWZlc3Q=" },
  noUpdateAvailable: { body: noUpdateBody, signature: "bm8tdXBkYXRl" },
};
const rollBack: PublishedUpdate = {
  _tag: "RollBackToEmbedded",
  directive: { body: rollBackBody, signature: "cm9sbGJhY2s=" },
  noUpdateAvailable: { body: noUpdateBody, signature: "bm8tdXBkYXRl" },
};

/** A bucket holding these objects. */
const storeWith = (objects: Record<string, string>): UpdateStore => ({
  readText: (key) => Effect.succeed(objects[key] ?? null),
  readAsset: () => Effect.succeed(null),
});

const publishedFor = (published: PublishedUpdate): UpdateStore =>
  storeWith({
    [`ios/${RUNTIME}/current.json`]: encodePublishedUpdate(published),
  });

const check = (overrides: Partial<UpdateCheck> = {}): UpdateCheck => ({
  protocolVersion: "1",
  platform: "ios",
  runtimeVersion: RUNTIME,
  currentUpdateId: EMBEDDED_ID,
  embeddedUpdateId: EMBEDDED_ID,
  ...overrides,
});

const answer = async (request: UpdateCheck, store: UpdateStore) =>
  renderUpdateAnswer(
    await Effect.runPromise(answerUpdateCheck(request, store)),
    "boundary-1"
  );

/** A one-part multipart body as phones parse it. */
const multipart = (name: string, signature: string, body: string) =>
  [
    "--boundary-1",
    `content-disposition: form-data; name="${name}"`,
    "content-type: application/json; charset=utf-8",
    `expo-signature: sig="${signature}", keyid="main"`,
    "",
    body,
    "--boundary-1--",
    "",
  ].join("\r\n");

const signedHeaders = {
  "expo-protocol-version": "1",
  "expo-sfv-version": "0",
  "content-type": "multipart/mixed; boundary=boundary-1",
};

describe(answerUpdateCheck, () => {
  it("sends the signed manifest to a phone running other code", async () => {
    await expect(answer(check(), publishedFor(update))).resolves.toStrictEqual({
      status: 200,
      headers: signedHeaders,
      body: multipart("manifest", "bWFuaWZlc3Q=", manifestBody),
    });
  });

  it("tells a phone already running the update there is nothing new", async () => {
    await expect(
      answer(check({ currentUpdateId: UPDATE_ID }), publishedFor(update))
    ).resolves.toStrictEqual({
      status: 200,
      headers: signedHeaders,
      body: multipart("directive", "bm8tdXBkYXRl", noUpdateBody),
    });
  });

  it("rolls phones running an update back to their build's code, and leaves the rest", async () => {
    const store = publishedFor(rollBack);
    const onUpdate = await answer(check({ currentUpdateId: UPDATE_ID }), store);
    const onEmbedded = await answer(check(), store);
    expect({
      onUpdate: onUpdate.body,
      onEmbedded: onEmbedded.body,
    }).toStrictEqual({
      onUpdate: multipart("directive", "cm9sbGJhY2s=", rollBackBody),
      onEmbedded: multipart("directive", "bm8tdXBkYXRl", noUpdateBody),
    });
  });

  it("answers 204 when nothing is published for the runtime version", async () => {
    await expect(
      answer(
        check({ runtimeVersion: "0000000000000000000000000000000000000000" }),
        publishedFor(update)
      )
    ).resolves.toStrictEqual({
      status: 204,
      headers: { "expo-protocol-version": "1", "expo-sfv-version": "0" },
      body: "",
    });
  });

  it("refuses other protocol versions, platforms, and runtime versions that are not fingerprints", async () => {
    const store = publishedFor(update);
    const statuses = await Promise.all(
      [
        check({ protocolVersion: "0" }),
        check({ protocolVersion: undefined }),
        check({ platform: "android" }),
        check({ runtimeVersion: undefined }),
        check({ runtimeVersion: `../${RUNTIME}` }),
        check({ runtimeVersion: "1.0.0" }),
      ].map(async (request) => {
        const { status, body } = await answer(request, store);
        return `${status} ${body}`;
      })
    );

    expect(statuses).toStrictEqual([
      "406 Expected expo-protocol-version 1.",
      "406 Expected expo-protocol-version 1.",
      "400 Updates are published for iOS only.",
      "400 Expected an expo-runtime-version fingerprint.",
      "400 Expected an expo-runtime-version fingerprint.",
      "400 Expected an expo-runtime-version fingerprint.",
    ]);
  });

  it("fails rather than serving a stored answer it cannot decode or a bucket it cannot read", async () => {
    const corrupt = await Effect.runPromise(
      Effect.flip(
        answerUpdateCheck(
          check(),
          storeWith({ [`ios/${RUNTIME}/current.json`]: '{"_tag":"Update"}' })
        )
      )
    );
    const unavailable = await Effect.runPromise(
      Effect.flip(
        answerUpdateCheck(check(), {
          readText: () =>
            Effect.fail(new UpdateStoreUnavailable({ reason: "R2 timeout" })),
          readAsset: () => Effect.succeed(null),
        })
      )
    );

    expect([corrupt, unavailable]).toStrictEqual([
      new PublishedUpdateUnreadable({ key: `ios/${RUNTIME}/current.json` }),
      new UpdateStoreUnavailable({ reason: "R2 timeout" }),
    ]);
  });
});
