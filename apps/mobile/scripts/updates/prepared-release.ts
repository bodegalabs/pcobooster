/**
 * A release the publisher prepared and signed, handed to the publishing stack
 * (`alchemy.mobile-updates.ts`) through `PCOB_MOBILE_UPDATE_RELEASE`. Every upload names the
 * hash its bytes must have when the stack reads them, so nothing that changed after signing is
 * stored.
 */
import { Schema } from "effect";

/** Stages updates are published to: production, and the local stack for rehearsals. */
export const updateStageSchema = Schema.Literals(["prod", "local"]);
export type UpdateStage = typeof updateStageSchema.Type;

export const preparedReleaseSchema = Schema.Struct({
  stage: updateStageSchema,
  runtimeVersion: Schema.String,
  /** The commit the release was prepared from. */
  revision: Schema.String,
  /** What phones are told: an update's id, or the rollback. */
  summary: Schema.String,
  /** The stored answer (`@pcobooster/contracts/mobile-updates`), encoded, signed. */
  record: Schema.String,
  uploads: Schema.Array(
    Schema.Struct({
      hash: Schema.String,
      /** Absolute path of the file to store under `hash`. */
      path: Schema.String,
      contentType: Schema.String,
    })
  ),
});
export type PreparedRelease = typeof preparedReleaseSchema.Type;

export const decodePreparedRelease = Schema.decodeUnknownSync(
  Schema.fromJsonString(preparedReleaseSchema)
);
export const encodePreparedRelease = Schema.encodeSync(
  Schema.fromJsonString(preparedReleaseSchema)
);

/** The variable naming the prepared release file for the publishing stack. */
export const RELEASE_VARIABLE = "PCOB_MOBILE_UPDATE_RELEASE";
