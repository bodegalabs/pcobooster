/** The stage's iOS update bucket as the update routes read it; the Worker backs it with R2. */
import { Data } from "effect";
import type { Effect } from "effect";

/** The update bucket could not be read. */
export class UpdateStoreUnavailable extends Data.TaggedError(
  "UpdateStoreUnavailable"
)<{ readonly reason: string }> {}

/** An asset as stored. The largest, the JavaScript bundle, is a few megabytes. */
export interface StoredAsset {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

/** Reads the stage's update bucket; a missing object reads as `null`, as R2 returns it. */
export interface UpdateStore {
  readonly readText: (
    key: string
  ) => Effect.Effect<string | null, UpdateStoreUnavailable>;
  readonly readAsset: (
    key: string
  ) => Effect.Effect<StoredAsset | null, UpdateStoreUnavailable>;
}
