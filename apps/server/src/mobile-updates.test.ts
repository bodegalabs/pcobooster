import { UpdateStoreUnavailable } from "@pcobooster/api/modules/mobile-updates/update-store";
import type { UpdateStore } from "@pcobooster/api/modules/mobile-updates/update-store";
import { testServer } from "@pcobooster/api/testing/server";
import { encodePublishedUpdate } from "@pcobooster/contracts/mobile-updates";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { serveHttpForTest } from "./test-http";

const RUNTIME = "26d8f75d228029e1bf0e5b295511ca1b76c3f825";
const BUNDLE_HASH = "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU";
const manifestBody = `{"id":"0b6c1e9a-58d4-4a5e-9d33-6f1c2b7e8a10","runtimeVersion":"${RUNTIME}"}`;

const bucket: UpdateStore = {
  readText: (key) =>
    Effect.succeed(
      key === `ios/${RUNTIME}/current.json`
        ? encodePublishedUpdate({
            _tag: "Update",
            updateId: "0b6c1e9a-58d4-4a5e-9d33-6f1c2b7e8a10",
            manifest: { body: manifestBody, signature: "c2lnbmF0dXJl" },
            noUpdateAvailable: {
              body: '{"type":"noUpdateAvailable"}',
              signature: "bm8tdXBkYXRl",
            },
          })
        : null
    ),
  readAsset: (key) =>
    Effect.succeed(
      key === `assets/${BUNDLE_HASH}`
        ? {
            bytes: new TextEncoder().encode("bytecode"),
            contentType: "application/javascript",
          }
        : null
    ),
};

const checkHeaders = {
  "expo-protocol-version": "1",
  "expo-platform": "ios",
  "expo-runtime-version": RUNTIME,
  "expo-expect-signature": 'sig, keyid="main", alg="rsa-v1_5-sha256"',
};

describe("iOS over-the-air update routes", () => {
  it("answers update checks and asset downloads from the update bucket, privately", async () => {
    const app = serveHttpForTest({ server: testServer(), updates: bucket });

    const check = await app.request("/api/updates/manifest", {
      headers: checkHeaders,
    });
    const asset = await app.request(`/api/updates/assets/${BUNDLE_HASH}`);
    const boundary = /boundary=(?<value>\S+)/u.exec(
      check.headers.get("content-type") ?? ""
    )?.groups?.value;

    expect({
      check: [
        check.status,
        check.headers.get("expo-protocol-version"),
        check.headers.get("cache-control"),
        await check.text(),
      ],
      asset: [
        asset.status,
        asset.headers.get("content-type"),
        asset.headers.get("cache-control"),
        await asset.text(),
      ],
    }).toStrictEqual({
      check: [
        200,
        "1",
        "private, no-store",
        [
          `--${boundary}`,
          'content-disposition: form-data; name="manifest"',
          "content-type: application/json; charset=utf-8",
          'expo-signature: sig="c2lnbmF0dXJl", keyid="main"',
          "",
          manifestBody,
          `--${boundary}--`,
          "",
        ].join("\r\n"),
      ],
      asset: [200, "application/javascript", "private, no-store", "bytecode"],
    });
  });

  it("answers 204 for a runtime version with nothing published and 404 for an unknown asset", async () => {
    const app = serveHttpForTest({ server: testServer(), updates: bucket });

    const responses = await Promise.all([
      app.request("/api/updates/manifest", {
        headers: {
          ...checkHeaders,
          "expo-runtime-version": "0000000000000000000000000000000000000000",
        },
      }),
      app.request(
        "/api/updates/assets/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      ),
      app.request("/api/updates/assets/not-a-hash"),
    ]);

    expect(responses.map((response) => response.status)).toStrictEqual([
      204, 404, 404,
    ]);
  });

  it("answers 503 and logs the failure when the bucket cannot be read", async () => {
    const app = serveHttpForTest({
      server: testServer(),
      updates: {
        readText: () =>
          Effect.fail(new UpdateStoreUnavailable({ reason: "R2 timeout" })),
        readAsset: () =>
          Effect.fail(new UpdateStoreUnavailable({ reason: "R2 timeout" })),
      },
    });

    const responses = await Promise.all([
      app.request("/api/updates/manifest", { headers: checkHeaders }),
      app.request(`/api/updates/assets/${BUNDLE_HASH}`),
    ]);

    expect({
      statuses: responses.map((response) => response.status),
      logged: app.logs
        .filter((line) => line.message === "update bucket unreadable")
        .map((line) => line.fields.reason),
    }).toStrictEqual({
      statuses: [503, 503],
      logged: ["R2 timeout", "R2 timeout"],
    });
  });
});
