/**
 * The two routes iOS builds use for over-the-air updates, outside the product API because the
 * Expo Updates protocol fixes their requests and multipart answers: the update check
 * (`GET /api/updates/manifest`) and asset downloads (`GET /api/updates/assets/:hash`). Both are
 * public and only read the stage's update bucket (`MobileUpdates`); see
 * `@pcobooster/contracts/mobile-updates`.
 */
import { moduleLog } from "@pcobooster/api/logging";
import {
  answerUpdateCheck,
  renderUpdateAnswer,
} from "@pcobooster/api/modules/mobile-updates/update-check";
import type { UpdateStore } from "@pcobooster/api/modules/mobile-updates/update-store";
import { assetKey, isAssetHash } from "@pcobooster/contracts/mobile-updates";
import { Context, Effect } from "effect";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

const log = moduleLog("mobile-updates");

/** The stage's update bucket, read inside each request. */
export class MobileUpdates extends Context.Service<
  MobileUpdates,
  UpdateStore
>()("@pcobooster/api/MobileUpdates") {}

const NOT_FOUND = 404;
const SERVICE_UNAVAILABLE = 503;

/** A header's value; repeated headers are not part of the protocol, so they read as absent. */
const header = (
  headers: Readonly<Record<string, string | undefined>>,
  name: string
): string | undefined => headers[name];

const unavailable = HttpServerResponse.text("Updates are unavailable", {
  status: SERVICE_UNAVAILABLE,
});

export const updateCheckRoute = Effect.gen(function* checkForUpdate() {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const store = yield* MobileUpdates;
  const check = {
    protocolVersion: header(request.headers, "expo-protocol-version"),
    platform: header(request.headers, "expo-platform"),
    runtimeVersion: header(request.headers, "expo-runtime-version"),
    currentUpdateId: header(request.headers, "expo-current-update-id"),
    embeddedUpdateId: header(request.headers, "expo-embedded-update-id"),
  };
  return yield* answerUpdateCheck(check, store).pipe(
    Effect.tap((answer) =>
      log.info("update check", {
        runtimeVersion: check.runtimeVersion ?? "",
        currentUpdateId: check.currentUpdateId ?? "",
        outcome: answer._tag === "Signed" ? answer.outcome : answer._tag,
      })
    ),
    Effect.map((answer) => {
      const rendered = renderUpdateAnswer(
        answer,
        `pcobooster-update-${crypto.randomUUID()}`
      );
      return rendered.status === 204
        ? HttpServerResponse.empty({ status: 204, headers: rendered.headers })
        : HttpServerResponse.text(rendered.body, {
            status: rendered.status,
            headers: rendered.headers,
          });
    }),
    Effect.catchTags({
      UpdateStoreUnavailable: (failure) =>
        log
          .error("update bucket unreadable", { reason: failure.reason })
          .pipe(Effect.as(unavailable)),
      PublishedUpdateUnreadable: (failure) =>
        log
          .error("published update does not decode", { key: failure.key })
          .pipe(Effect.as(unavailable)),
    })
  );
});

export const updateAssetRoute = Effect.gen(function* downloadUpdateAsset() {
  const { hash = "" } = yield* HttpRouter.params;
  if (!isAssetHash(hash)) {
    return HttpServerResponse.text("Unknown asset", { status: NOT_FOUND });
  }
  const store = yield* MobileUpdates;
  return yield* store.readAsset(assetKey(hash)).pipe(
    Effect.map((asset) =>
      asset === null
        ? HttpServerResponse.text("Unknown asset", { status: NOT_FOUND })
        : HttpServerResponse.uint8Array(asset.bytes, {
            contentType: asset.contentType,
          })
    ),
    Effect.catchTag("UpdateStoreUnavailable", (failure) =>
      log
        .error("update bucket unreadable", { hash, reason: failure.reason })
        .pipe(Effect.as(unavailable))
    )
  );
});
